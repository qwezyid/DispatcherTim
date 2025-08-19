# app.py
import os
from typing import List, Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import hashlib, hmac, base64

load_dotenv()
PG_DSN = os.environ["PG_DSN"]
JWT_SECRET = os.environ.get("JWT_SECRET", "change_me")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

app = FastAPI()  # <-- создать приложение ДО использования

# Можно управлять из переменной окружения: ALLOWED_ORIGINS="https://dispatcher-tim.vercel.app,http://localhost:3000"
_allowed = os.environ.get("ALLOWED_ORIGINS", "https://dispatcher-tim.vercel.app,http://localhost:3000")
allow_origins = ["*"] if _allowed.strip() == "*" else [o.strip() for o in _allowed.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- простейшая авторизация (логин/пароль в env) ---
APP_LOGIN = os.environ.get("APP_LOGIN", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "admin")

def issue_token(username:str)->str:
    # простенький HMAC токен (НЕ JWT, но хватает для MVP)
    ts = str(int(datetime.utcnow().timestamp()))
    mac = hmac.new(JWT_SECRET.encode(), f"{username}:{ts}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(f"{username}.{ts}.".encode() + mac).decode()

def require_token(token: Optional[str]):
    if not token:
        raise HTTPException(status_code=401, detail="No token")
    try:
        raw = base64.urlsafe_b64decode(token.encode())
        parts = raw.split(b'.')
        if len(parts) < 3: raise ValueError
        username = parts[0].decode()
        mac = parts[2]
        calc = hmac.new(JWT_SECRET.encode(), f"{username}:{parts[1].decode()}".encode(), hashlib.sha256).digest()
        if mac != calc: raise ValueError
        return username
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

class LoginPayload(BaseModel):
    username: str
    password: str

@app.post("/auth/login")
def login(p: LoginPayload):
    if p.username == APP_LOGIN and p.password == APP_PASSWORD:
        return {"token": issue_token(p.username)}
    raise HTTPException(status_code=401, detail="Bad credentials")

def db():
    conn = psycopg2.connect(PG_DSN, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()

# --------- MODELS ---------
class VariantCreate(BaseModel):
    title: Optional[str] = None
    path: str  # "Город - Город - ... - Город"

class VariantStopsReplace(BaseModel):
    stops: List[str]

class CarrierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None

class CarrierGroupLink(BaseModel):
    group_id: int
    default_variant_id: Optional[int] = None

class ShipmentCreate(BaseModel):
    ext_id: Optional[str] = None
    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    origin_city: str
    destination_city: str
    price_cost_rub: Optional[float] = None
    carrier_id: Optional[int] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    route_label: Optional[str] = None

class SearchQuery(BaseModel):
    origin: str
    destination: str

class AutoDerivePayload(BaseModel):
    origin: str
    destination: str

# ---------- HELPERS ----------
def norm_city(s: str)->str:
    return " ".join(s.split()).strip()

def parse_path(path: str)->List[str]:
    # разделители: -, —, ->, →
    import re
    parts = re.split(r"\s*[-—→>]\s*", path)
    parts = [norm_city(p) for p in parts if p and norm_city(p)]
    # убрать подряд дубли
    out = []
    for p in parts:
        if not out or out[-1].lower()!=p.lower():
            out.append(p)
    if len(out) < 2:
        raise HTTPException(status_code=400, detail="Минимум 2 точки (origin, destination)")
    return out

def ensure_group(conn, a: str, b: str)->int:
    a, b = norm_city(a), norm_city(b)
    city_a, city_b = (a, b) if a.lower() < b.lower() else (b, a)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO route_groups(city_a, city_b)
        VALUES (%s, %s)
        ON CONFLICT (city_a, city_b) DO NOTHING
        RETURNING id
    """, (city_a, city_b))
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute("SELECT id FROM route_groups WHERE city_a=%s AND city_b=%s", (city_a, city_b))
    return cur.fetchone()["id"]

def validate_variant_belongs(group_row, stops: List[str]):
    a, b = group_row["city_a"], group_row["city_b"]
    s0, sN = norm_city(stops[0]), norm_city(stops[-1])
    # допускаем ввод любым направлением: либо (a..b), либо (b..a)
    if not ((s0.lower()==a.lower() and sN.lower()==b.lower()) or (s0.lower()==b.lower() and sN.lower()==a.lower())):
        raise HTTPException(status_code=400, detail=f"Путь должен начинаться/заканчиваться в границах группы ({a}—{b})")

# ---------- ROUTE GROUPS / VARIANTS ----------
@app.post("/route-groups/ensure")
def api_ensure_group(origin: str, destination: str, conn=Depends(db)):
    gid = ensure_group(conn, origin, destination)
    conn.commit()
    return {"group_id": gid}

@app.get("/route-groups")
def list_groups(conn=Depends(db)):
    cur = conn.cursor()
    # объединяем с mv_group_stats (может ещё не существовать)
    cur.execute("""
    SELECT g.id, g.city_a, g.city_b,
           COALESCE(s.trips,0) AS trips,
           COALESCE(s.drivers,0) AS drivers,
           s.avg_price, s.min_price, s.max_price, s.total_price
    FROM route_groups g
    LEFT JOIN mv_group_stats s
      ON lower(g.city_a)=s.city_a AND lower(g.city_b)=s.city_b
    ORDER BY g.city_a, g.city_b
    """)
    return cur.fetchall()

@app.get("/route-groups/{group_id}")
def get_group(group_id:int, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("SELECT * FROM route_groups WHERE id=%s", (group_id,))
    g = cur.fetchone()
    if not g: raise HTTPException(status_code=404, detail="Group not found")
    cur.execute("SELECT * FROM route_variants WHERE group_id=%s AND is_active=TRUE ORDER BY id", (group_id,))
    variants = cur.fetchall()
    for v in variants:
        cur.execute("SELECT city, seq FROM route_variant_stops WHERE variant_id=%s ORDER BY seq", (v["id"],))
        v["stops"] = cur.fetchall()
    cur.execute("""
      SELECT cgl.id, c.id AS carrier_id, c.name, c.phone, cgl.default_variant_id
      FROM carrier_group_links cgl
      JOIN carriers c ON c.id=cgl.carrier_id
      WHERE cgl.group_id=%s
    """,(group_id,))
    links = cur.fetchall()
    return {"group": g, "variants": variants, "carrier_links": links}

@app.post("/route-groups/{group_id}/variants")
def create_variant(group_id:int, payload: VariantCreate, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("SELECT * FROM route_groups WHERE id=%s", (group_id,))
    g = cur.fetchone()
    if not g: raise HTTPException(status_code=404, detail="Group not found")
    stops = parse_path(payload.path)
    validate_variant_belongs(g, stops)
    # если введено в обратном порядке, храним в каноне (city_a -> city_b)
    s0, sN = stops[0].lower(), stops[-1].lower()
    if not (s0==g["city_a"].lower() and sN==g["city_b"].lower()):
        stops = list(reversed(stops))
    cur.execute("INSERT INTO route_variants(group_id, title) VALUES (%s,%s) RETURNING id", (group_id, payload.title))
    vid = cur.fetchone()["id"]
    # seq: 0, 100, 200, ..., 9999 (последний)
    seq = 0
    for i, city in enumerate(stops):
        if i == len(stops)-1:
            seq = 9999
        cur.execute("INSERT INTO route_variant_stops(variant_id, seq, city) VALUES (%s,%s,%s)", (vid, seq, norm_city(city)))
        if i < len(stops)-2:
            seq += 100
    conn.commit()
    return {"variant_id": vid}

@app.put("/route-variants/{variant_id}/stops")
def replace_variant_stops(variant_id:int, payload: VariantStopsReplace, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("SELECT rv.*, rg.city_a, rg.city_b FROM route_variants rv JOIN route_groups rg ON rg.id=rv.group_id WHERE rv.id=%s", (variant_id,))
    row = cur.fetchone()
    if not row: raise HTTPException(status_code=404, detail="Variant not found")
    stops = [norm_city(x) for x in payload.stops if x and norm_city(x)]
    if len(stops) < 2: raise HTTPException(status_code=400, detail="Минимум 2 точки")
    # канон
    if not (stops[0].lower()==row["city_a"].lower() and stops[-1].lower()==row["city_b"].lower()):
        if (stops[0].lower()==row["city_b"].lower() and stops[-1].lower()==row["city_a"].lower()):
            stops = list(reversed(stops))
        else:
            raise HTTPException(status_code=400, detail=f"Границы должны быть {row['city_a']}—{row['city_b']}")
    cur.execute("DELETE FROM route_variant_stops WHERE variant_id=%s", (variant_id,))
    seq=0
    for i, city in enumerate(stops):
        if i == len(stops)-1: seq=9999
        cur.execute("INSERT INTO route_variant_stops(variant_id, seq, city) VALUES (%s,%s,%s)", (variant_id, seq, city))
        if i < len(stops)-2: seq += 100
    conn.commit()
    return {"status":"ok"}

# --------- AUTO-DERIVE сегмента (под-маршрут) ---------
@app.post("/route-groups/auto-derive")
def auto_derive_segment(p: AutoDerivePayload, conn=Depends(db)):
    o = norm_city(p.origin); d = norm_city(p.destination)
    # найдём любой активный вариант, где есть обе точки по порядку
    cur = conn.cursor()
    cur.execute("""
    SELECT rv.id AS variant_id, rg.id AS group_id, rg.city_a, rg.city_b
    FROM route_variants rv
    JOIN route_groups rg ON rg.id = rv.group_id
    WHERE rv.is_active = TRUE
    """)
    variants = cur.fetchall()
    for v in variants:
        cur.execute("SELECT city, seq FROM route_variant_stops WHERE variant_id=%s ORDER BY seq", (v["variant_id"],))
        stops = cur.fetchall()
        city_to_seq = {s["city"].lower(): s["seq"] for s in stops}
        if o.lower() in city_to_seq and d.lower() in city_to_seq:
            so, sd = city_to_seq[o.lower()], city_to_seq[d.lower()]
            # получаем срез
            path = []
            if so < sd:
                for s in stops:
                    if so <= s["seq"] <= sd: path.append(s["city"])
            else:
                for s in reversed(stops):
                    if sd <= s["seq"] <= so: path.append(s["city"])
            # обеспечим группу под пару (o,d)
            gid = ensure_group(conn, o, d)
            # запишем сегмент (ссылается на parent_variant)
            start_seq, end_seq = (so, sd) if so < sd else (sd, so)
            cur2 = conn.cursor()
            cur2.execute("""
            INSERT INTO route_variant_segments(group_id, parent_variant_id, start_seq, end_seq)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (group_id, parent_variant_id, start_seq, end_seq) DO NOTHING
            """, (gid, v["variant_id"], start_seq, end_seq))
            conn.commit()
            return {"group_id": gid, "parent_variant_id": v["variant_id"], "path": path}
    raise HTTPException(status_code=404, detail="Подходящий родительский вариант не найден")

# --------- CARRIERS ----------
@app.post("/carriers")
def create_carrier(p: CarrierCreate, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO carriers(name, phone, vehicle_make, vehicle_model)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (name, phone) DO UPDATE SET vehicle_make=EXCLUDED.vehicle_make, vehicle_model=EXCLUDED.vehicle_model
        RETURNING id
    """,(p.name, p.phone, p.vehicle_make, p.vehicle_model))
    cid = cur.fetchone()["id"]
    conn.commit()
    return {"id": cid}

@app.post("/carriers/{carrier_id}/groups")
def link_carrier(carrier_id:int, p: CarrierGroupLink, conn=Depends(db)):
    cur = conn.cursor()
    # если default_variant_id не передан, но в группе один вариант — подставим его
    if p.default_variant_id is None:
        cur.execute("SELECT id FROM route_variants WHERE group_id=%s AND is_active=TRUE", (p.group_id,))
        rows = cur.fetchall()
        if len(rows)==1:
            p.default_variant_id = rows[0]["id"]
    cur.execute("""
        INSERT INTO carrier_group_links(carrier_id, group_id, default_variant_id)
        VALUES (%s,%s,%s)
        ON CONFLICT (carrier_id, group_id) DO UPDATE SET default_variant_id = EXCLUDED.default_variant_id
        RETURNING id
    """, (carrier_id, p.group_id, p.default_variant_id))
    lid = cur.fetchone()["id"]
    conn.commit()
    return {"id": lid, "default_variant_id": p.default_variant_id}

# ПОИСК ПЕРЕВОЗЧИКОВ ПО ОТРЕЗКУ МАРШРУТА
@app.get("/carriers/search")
def search_carriers(origin: str, destination: str, conn=Depends(db)):
    """
    Находит водителей, привязанных к группе того варианта,
    где origin и destination встречаются в правильном порядке (so.seq < sd.seq).
    Если у водителя задан default_variant_id, фильтруем по нему.
    Возвращает: carrier_id, name, phone, path (список городов по отрезку).
    """
    cur = conn.cursor()
    cur.execute("""
    WITH seg AS (
      SELECT rv.id AS variant_id, rv.group_id,
             so.seq AS start_seq, sd.seq AS end_seq
      FROM route_variant_stops so
      JOIN route_variant_stops sd
        ON sd.variant_id = so.variant_id AND sd.seq > so.seq
      JOIN route_variants rv ON rv.id = so.variant_id
      WHERE lower(so.city) = lower(%s) AND lower(sd.city) = lower(%s)
    )
    SELECT DISTINCT
      c.id   AS carrier_id,
      c.name AS name,
      c.phone AS phone,
      (
        SELECT array_agg(s.city ORDER BY s.seq)
        FROM route_variant_stops s
        WHERE s.variant_id = seg.variant_id
          AND s.seq BETWEEN seg.start_seq AND seg.end_seq
      ) AS path
    FROM seg
    JOIN carrier_group_links cgl ON cgl.group_id = seg.group_id
    JOIN carriers c ON c.id = cgl.carrier_id
    WHERE cgl.default_variant_id IS NULL
       OR cgl.default_variant_id = seg.variant_id
    """, (origin, destination))
    return cur.fetchall()

# --------- SHIPMENTS & REPORTS ----------
# --------- SHIPMENTS & REPORTS ----------
@app.get("/shipments")
def list_shipments(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    carrier: Optional[str] = None,   # может быть ID или часть ФИО
    limit: int = 200,
    offset: int = 0,
    conn=Depends(db)
):
    where = []
    params: list = []

    # фильтры по городу — ставим алиас s.
    if origin:
        where.append("lower(s.origin_city) = lower(%s)")
        params.append(origin)
    if destination:
        where.append("lower(s.destination_city) = lower(%s)")
        params.append(destination)

    # даты
    if date_from:
        where.append("s.created_at >= %s")
        params.append(date_from)
    if date_to:
        where.append("s.created_at <= %s")
        params.append(date_to)

    # фильтр по перевозчику:
    # - если пришла цифра → по ID
    # - иначе ищем по ФИО (ILIKE)
    if carrier:
        if str(carrier).isdigit():
            where.append("s.carrier_id = %s")
            params.append(int(carrier))
        else:
            where.append("c.name ILIKE %s")
            params.append(f"%{carrier}%")

    sql = """
    SELECT
      s.*,
      c.name  AS carrier_name,
      c.phone AS carrier_phone
    FROM shipments s
    LEFT JOIN carriers c ON c.id = s.carrier_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)

    sql += " ORDER BY COALESCE(s.closed_at, s.created_at) DESC LIMIT %s OFFSET %s"
    params += [limit, offset]

    cur = conn.cursor()
    cur.execute(sql, params)
    return cur.fetchall()

@app.post("/shipments")
def create_shipment(p: ShipmentCreate, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO shipments(ext_id, created_at, closed_at, origin_city, destination_city,
                          price_cost_rub, carrier_id, vehicle_make, vehicle_model, route_label)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (p.ext_id, p.created_at, p.closed_at, norm_city(p.origin_city), norm_city(p.destination_city),
          p.price_cost_rub, p.carrier_id, p.vehicle_make, p.vehicle_model, p.route_label))
    sid = cur.fetchone()["id"]
    # базовые точки
    cur.execute("INSERT INTO shipment_stops(shipment_id, seq, city) VALUES (%s,0,%s), (%s,9999,%s)",
                (sid, norm_city(p.origin_city), sid, norm_city(p.destination_city)))
    conn.commit()
    return {"id": sid}

@app.delete("/route-groups/{group_id}")
def delete_group(group_id: int, conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("DELETE FROM carrier_group_links WHERE group_id=%s", (group_id,))
    cur.execute("DELETE FROM route_groups WHERE id=%s", (group_id,))  # CASCADE удалит варианты/точки
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    conn.commit()
    return {"status": "deleted"}

@app.get("/reports/groups.csv")
def report_groups(conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
    SELECT g.city_a||' — '||g.city_b AS route,
           COALESCE(s.trips,0) AS trips, COALESCE(s.drivers,0) AS drivers,
           s.avg_price, s.min_price, s.max_price, s.total_price
    FROM route_groups g
    LEFT JOIN mv_group_stats s ON lower(g.city_a)=s.city_a AND lower(g.city_b)=s.city_b
    ORDER BY g.city_a, g.city_b
    """)
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["Маршрут","Рейсов","Водителей","Средняя","Мин","Макс","Сумма"])
    for r in cur.fetchall():
        writer.writerow([r["route"], r["trips"], r["drivers"], r["avg_price"], r["min_price"], r["max_price"], r["total_price"]])
    return {"filename":"groups.csv","content":output.getvalue()}
