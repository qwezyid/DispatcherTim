"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * =====================
 * CONFIG
 * =====================
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Helper fetch with JSON handling & token header
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  // CSV or plain text
  // @ts-ignore
  return res.text();
}

/**
 * =====================
 * UI PRIMITIVES (Tailwind only)
 * =====================
 */
const Card: React.FC<{ className?: string; children: React.ReactNode }>=({className, children})=> (
  <div className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className||""}`}>{children}</div>
);
const CardHeader: React.FC<{title:string; subtitle?:string; right?:React.ReactNode}> = ({title, subtitle, right})=> (
  <div className="flex items-start justify-between gap-4 p-5 border-b border-zinc-200 dark:border-zinc-800">
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
    </div>
    {right}
  </div>
);
const CardBody: React.FC<{className?:string; children: React.ReactNode}> = ({className, children}) => (
  <div className={`p-5 ${className||""}`}>{children}</div>
);
const Button: React.FC<{children:React.ReactNode; onClick?:()=>void; type?:"button"|"submit"; variant?:"primary"|"ghost"|"outline"; className?:string; disabled?:boolean}> = ({children, onClick, type="button", variant="primary", className, disabled})=> {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
    ghost: "hover:bg-zinc-100 dark:hover:bg-zinc-800",
    outline: "border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
  } as const;
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className||""}`}>{children}</button>
}
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props)=> (
  <input {...props} className={`w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 ${props.className||""}`} />
);
const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props)=> (
  <textarea {...(props as any)} className={`w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 ${props.className||""}`} />
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props)=> (
  <select {...props} className={`w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 ${props.className||""}`} />
);
const Badge: React.FC<{children:React.ReactNode; className?:string}> = ({children,className})=> (
  <span className={`inline-flex items-center rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 ${className||""}`}>{children}</span>
);

/**
 * =====================
 * Hooks & helpers
 * =====================
 */
const useDarkMode = () => {
  const [dark, setDark] = useState(false);
  useEffect(()=>{
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.add("bg-zinc-50");
  },[]);
  const toggle = ()=>{
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next?"dark":"light");
  };
  return {dark, toggle};
};

function cn(...c: (string|false|undefined)[]){return c.filter(Boolean).join(" ");}

/**
 * =====================
 * Auth view
 * =====================
 */
const AuthPanel: React.FC<{onLogged:()=>void}> = ({onLogged})=>{
  const [username, setU] = useState("admin");
  const [password, setP] = useState("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const login = async (e: React.FormEvent)=>{
    e.preventDefault(); setLoading(true); setError(null);
    try{
      const res = await api<{token:string}>(`/auth/login`, {method:"POST", body: JSON.stringify({username, password})});
      localStorage.setItem("token", res.token);
      onLogged();
    }catch(err:any){ setError(err.message);} finally{ setLoading(false);}  
  };
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader title="Вход" subtitle="Введите логин и пароль" />
        <CardBody>
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="text-sm text-zinc-600 dark:text-zinc-300">Логин</label>
              <Input value={username} onChange={e=>setU(e.target.value)} placeholder="admin" />
            </div>
            <div>
              <label className="text-sm text-zinc-600 dark:text-zinc-300">Пароль</label>
              <Input value={password} onChange={e=>setP(e.target.value)} type="password" placeholder="••••••" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={loading}>{loading?"Входим…":"Войти"}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};

/**
 * =====================
 * Tabs container
 * =====================
 */
const Tabs: React.FC<{tabs: {id:string; title:string; content:React.ReactNode}[]}> = ({tabs})=>{
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            {tabs.map(t=> (
              <button key={t.id} onClick={()=>setActive(t.id)}
                className={cn("px-4 py-2 rounded-xl text-sm font-medium", active===t.id?"bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900":"hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300")}
              >{t.title}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {tabs.map(t=> active===t.id && <div key={t.id}>{t.content}</div>)}
      </div>
    </div>
  );
};

/**
 * =====================
 * TAB 1: Маршрут
 * =====================
 */
const RoutesTab: React.FC = () => {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [ensure, setEnsure] = useState({from:"", to:""});

  const fetchData = async ()=>{
    setLoading(true); setErr(null);
    try{ const data = await api<any[]>("/route-groups"); setRoutes(data);}catch(e:any){setErr(e.message)} finally{setLoading(false)}
  };
  useEffect(()=>{fetchData();}, []);

  const downloadCSV = async ()=>{
    const text = await api<string>("/reports/groups.csv");
    const blob = new Blob([text], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "groups.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const ensureGroup = async ()=>{
    if(!ensure.from || !ensure.to) return;
    await api(`/route-groups/ensure?origin=${encodeURIComponent(ensure.from)}&destination=${encodeURIComponent(ensure.to)}`, {method:"POST"});
    setEnsure({from:"", to:""});
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Маршруты</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}>Обновить</Button>
          <Button onClick={downloadCSV}>Экспорт CSV</Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Создать/найти группу A↔B" subtitle="Группа создаётся в каноническом порядке автоматически" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Откуда (город)" value={ensure.from} onChange={e=>setEnsure(v=>({...v, from:e.target.value}))} />
            <Input placeholder="Куда (город)" value={ensure.to} onChange={e=>setEnsure(v=>({...v, to:e.target.value}))} />
            <Button onClick={ensureGroup}>Создать/Найти</Button>
          </div>
        </CardBody>
      </Card>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <div className="grid gap-4">
        {routes.map((r)=> (
          <RouteGroupCard key={r.id} group={r} onChanged={fetchData} />
        ))}
        {(!loading && routes.length===0) && <p className="text-sm text-zinc-500">Пока нет групп. Создайте первую.</p>}
      </div>
    </div>
  );
};

const RouteGroupCard: React.FC<{group:any; onChanged:()=>void}> = ({group, onChanged})=>{
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        title={`${group.city_a} — ${group.city_b}`}
        subtitle={`Рейсов: ${group.trips||0} | Водителей: ${group.drivers||0} | Средняя: ${fmt(group.avg_price)} ₽ | Диапазон: ${fmt(group.min_price)}–${fmt(group.max_price)} ₽ | Сумма: ${fmt(group.total_price)} ₽`}
        right={<Button variant="ghost" onClick={()=>setOpen(o=>!o)}>{open?"Скрыть":"Открыть"}</Button>}
      />
      {open && <CardBody>
        <GroupDetails id={group.id} onChanged={onChanged} />
      </CardBody>}
    </Card>
  );
};

const GroupDetails: React.FC<{id:number; onChanged:()=>void}> = ({id, onChanged})=>{
  const [data, setData] = useState<any|null>(null);
  const [err, setErr] = useState<string|null>(null);
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [auto, setAuto] = useState({origin:"", destination:""});
  const [carrierLink, setCarrierLink] = useState({carrier_id:"", default_variant_id:""});

  const load = async ()=>{
    try{ const d = await api(`/route-groups/${id}`); setData(d);} catch(e:any){ setErr(e.message);}  
  };
  useEffect(()=>{load();}, [id]);

  const createVariant = async ()=>{
    if(!path) return;
    await api(`/route-groups/${id}/variants`, {method:"POST", body: JSON.stringify({title, path})});
    setPath("");
    setTitle("");
    await load();
    onChanged();
  };

  const autoDerive = async ()=>{
    if(!auto.origin || !auto.destination) return;
    const res = await api(`/route-groups/auto-derive`, {
      method: "POST",
      body: JSON.stringify(auto)
    }) as { path: string[] };
    alert(`Авто-маршрут: ${res.path.join(" → ")}`);
    await load();
  };

  const linkCarrier = async ()=>{
    if(!carrierLink.carrier_id) return;
    await api(`/carriers/${carrierLink.carrier_id}/groups`, {method:"POST", body: JSON.stringify({group_id:id, default_variant_id: carrierLink.default_variant_id? Number(carrierLink.default_variant_id): null})});
    setCarrierLink({carrier_id:"", default_variant_id:""});
    await load();
  };

  if(!data) return <p className="text-sm text-zinc-500">Загрузка… {err && <span className="text-red-600">{err}</span>}</p>;

  return (
    <div className="space-y-8">
      {/* Перевозчики */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Перевозчики</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.carrier_links?.map((l:any)=> (
            <Badge key={l.id}>{l.name} · {l.phone} {l.default_variant_id? <span className="ml-1">(вариант #{l.default_variant_id})</span>: <span className="ml-1 text-zinc-500">(любой)</span>}</Badge>
          ))}
          {(!data.carrier_links || data.carrier_links.length===0) && <p className="text-sm text-zinc-500">Пока нет привязанных перевозчиков.</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="ID перевозчика" value={carrierLink.carrier_id} onChange={e=>setCarrierLink(v=>({...v, carrier_id:e.target.value}))} />
          <Input placeholder="ID варианта (опционально)" value={carrierLink.default_variant_id} onChange={e=>setCarrierLink(v=>({...v, default_variant_id:e.target.value}))} />
          <div></div>
          <Button onClick={linkCarrier}>Привязать</Button>
        </div>
      </section>

      {/* Варианты */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Варианты маршрута</h3>
        <div className="space-y-3">
          {data.variants?.map((v:any)=> (
            <VariantView key={v.id} variant={v} />
          ))}
          {(!data.variants || data.variants.length===0) && <p className="text-sm text-zinc-500">Пока нет вариантов. Создайте первый ниже.</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-4">
          <Input placeholder="Название варианта (опционально)" value={title} onChange={e=>setTitle(e.target.value)} className="md:col-span-2" />
          <Input placeholder="Путь: Город - Город - ... - Город" value={path} onChange={e=>setPath(e.target.value)} className="md:col-span-3" />
          <Button onClick={createVariant}>Добавить вариант</Button>
        </div>
      </section>

      {/* Автозаполнение под-маршрута */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Автозаполнение под-маршрута</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Откуда" value={auto.origin} onChange={e=>setAuto(v=>({...v, origin:e.target.value}))} />
          <Input placeholder="Куда" value={auto.destination} onChange={e=>setAuto(v=>({...v, destination:e.target.value}))} />
          <div></div>
          <Button onClick={autoDerive}>Построить отрезок</Button>
        </div>
      </section>
    </div>
  );
};

const VariantView: React.FC<{variant:any}> = ({variant})=>{
  const stops = (variant.stops||[]).map((s:any)=> s.city);
  return (
    <Card className="">
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>#{variant.id}</Badge>
          {variant.title && <Badge>{variant.title}</Badge>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {stops.map((c:string, i:number)=> (
            <React.Fragment key={i}>
              <Badge>{c}</Badge>
              {i<stops.length-1 && <span className="text-zinc-400">→</span>}
            </React.Fragment>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

function fmt(n: any){
  if(n===null||n===undefined) return "—";
  const num = Number(n);
  return isNaN(num)? String(n): num.toLocaleString("ru-RU");
}

/**
 * =====================
 * TAB 2: Водители
 * =====================
 */
const DriversTab: React.FC = () => {
  const [created, setCreated] = useState<string|number|undefined>();
  const [form, setForm] = useState({name:"", phone:"", vehicle_make:"", vehicle_model:""});
  const [driverId, setDriverId] = useState<string>("");
  const [driver, setDriver] = useState<any|null>(null);
  const [err, setErr] = useState<string|null>(null);

  const create = async ()=>{
    if(!form.name) return;
    const res = await api<{id:number}>(`/carriers`, {method:"POST", body: JSON.stringify(form)});
    setCreated(res.id);
  };

  const load = async ()=>{
    if(!driverId) return;
    try{ const d = await api(`/carriers/${driverId}`); setDriver(d); setErr(null);}catch(e:any){ setErr(e.message); setDriver(null);}  
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Водители</h1>

      <Card>
        <CardHeader title="Создать/обновить водителя" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Input placeholder="ФИО" value={form.name} onChange={e=>setForm(v=>({...v, name:e.target.value}))} />
            <Input placeholder="Телефон" value={form.phone} onChange={e=>setForm(v=>({...v, phone:e.target.value}))} />
            <Input placeholder="Марка" value={form.vehicle_make} onChange={e=>setForm(v=>({...v, vehicle_make:e.target.value}))} />
            <Input placeholder="Модель" value={form.vehicle_model} onChange={e=>setForm(v=>({...v, vehicle_model:e.target.value}))} />
            <Button onClick={create}>Сохранить</Button>
          </div>
          {created && <p className="text-sm text-emerald-600 mt-2">Создан/обновлён водитель ID {created}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Профиль водителя" subtitle="Просмотр по ID" right={<Button variant="outline" onClick={load}>Загрузить</Button>} />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
            <Input placeholder="ID водителя" value={driverId} onChange={e=>setDriverId(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!driver && <p className="text-sm text-zinc-500">Введите ID и нажмите «Загрузить».</p>}
          {driver && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge>#{driver.id}</Badge>
                <Badge>{driver.name}</Badge>
                <Badge>{driver.phone||"—"}</Badge>
              </div>
              <div>
                <h3 className="font-medium mb-2">Маршруты</h3>
                <div className="space-y-2">
                  {driver.routes?.map((r:any)=> (
                    <div key={r.group_id} className="flex flex-wrap items-center gap-2">
                      <Badge>{r.city_a} — {r.city_b}</Badge>
                      <Badge>{r.default_variant_id?`вариант #${r.default_variant_id}`:"любой вариант"}</Badge>
                    </div>
                  ))}
                  {(!driver.routes || driver.routes.length===0) && <p className="text-sm text-zinc-500">Маршрутов пока нет.</p>}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-2">Сделки</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-zinc-500">
                        <th className="py-2 pr-4">ID</th>
                        <th className="py-2 pr-4">Маршрут</th>
                        <th className="py-2 pr-4">Создана</th>
                        <th className="py-2 pr-4">Закрыта</th>
                        <th className="py-2 pr-4">Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driver.shipments?.map((s:any)=> (
                        <tr key={s.id} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="py-2 pr-4">{s.id}</td>
                          <td className="py-2 pr-4">{s.origin_city} → {s.destination_city}</td>
                          <td className="py-2 pr-4">{fmtDate(s.created_at)}</td>
                          <td className="py-2 pr-4">{fmtDate(s.closed_at)}</td>
                          <td className="py-2 pr-4">{fmt(s.price_cost_rub)} ₽</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

function fmtDate(d:any){
  if(!d) return "—";
  try{ return new Date(d).toLocaleString("ru-RU"); }catch{ return String(d); }
}

/**
 * =====================
 * TAB 3: Сделки
 * =====================
 */
const DealsTab: React.FC = () => {
  const [filters, setFilters] = useState({origin:"", destination:""});
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({origin_city:"", destination_city:"", carrier_id:"", price_cost_rub:""});

  const load = async ()=>{
    setLoading(true);
    const qs = new URLSearchParams();
    if(filters.origin) qs.set("origin", filters.origin);
    if(filters.destination) qs.set("destination", filters.destination);
    const data = await api<any[]>(`/shipments?${qs.toString()}`);
    setRows(data); setLoading(false);
  };
  useEffect(()=>{load();}, []);

  const create = async ()=>{
    if(!form.origin_city || !form.destination_city) return;
    await api(`/shipments`, {method:"POST", body: JSON.stringify({
      origin_city: form.origin_city, destination_city: form.destination_city,
      carrier_id: form.carrier_id? Number(form.carrier_id): null,
      price_cost_rub: form.price_cost_rub? Number(form.price_cost_rub): null
    })});
    setForm({origin_city:"", destination_city:"", carrier_id:"", price_cost_rub:""});
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Сделки</h1>

      <Card>
        <CardHeader title="Фильтры" right={<Button variant="outline" onClick={load}>Применить</Button>} />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Откуда" value={filters.origin} onChange={e=>setFilters(v=>({...v, origin:e.target.value}))} />
            <Input placeholder="Куда" value={filters.destination} onChange={e=>setFilters(v=>({...v, destination:e.target.value}))} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Создать сделку" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Input placeholder="Откуда" value={form.origin_city} onChange={e=>setForm(v=>({...v, origin_city:e.target.value}))} />
            <Input placeholder="Куда" value={form.destination_city} onChange={e=>setForm(v=>({...v, destination_city:e.target.value}))} />
            <Input placeholder="ID водителя (опц.)" value={form.carrier_id} onChange={e=>setForm(v=>({...v, carrier_id:e.target.value}))} />
            <Input placeholder="Цена ₽ (опц.)" value={form.price_cost_rub} onChange={e=>setForm(v=>({...v, price_cost_rub:e.target.value}))} />
            <Button onClick={create}>Создать</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Список сделок" subtitle={loading?"Загрузка…":`${rows.length} строк`} />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Маршрут</th>
                  <th className="py-2 pr-4">Создана</th>
                  <th className="py-2 pr-4">Закрыта</th>
                  <th className="py-2 pr-4">Цена</th>
                  <th className="py-2 pr-4">Водитель</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r)=> (
                  <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-4">{r.id}</td>
                    <td className="py-2 pr-4">{r.origin_city} → {r.destination_city}</td>
                    <td className="py-2 pr-4">{fmtDate(r.created_at)}</td>
                    <td className="py-2 pr-4">{fmtDate(r.closed_at)}</td>
                    <td className="py-2 pr-4">{fmt(r.price_cost_rub)} ₽</td>
                    <td className="py-2 pr-4">
                      {r.carrier_name 
                        ? `${r.carrier_name}${r.carrier_phone ? " ("+r.carrier_phone+")" : ""}` 
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

/**
 * =====================
 * TAB 4: Дашборд
 * =====================
 */
const DashboardTab: React.FC = () => {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async ()=>{ setLoading(true); const g = await api<any[]>("/route-groups"); setGroups(g); setLoading(false); };
  useEffect(()=>{load();}, []);

  const chartData = useMemo(()=> (
    (groups||[]).map(g=> ({ route: `${g.city_a}—${g.city_b}`, trips: g.trips||0, total: Number(g.total_price||0) }))
  ), [groups]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
        <Button variant="outline" onClick={load}>{loading?"Загрузка…":"Обновить"}</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="ТОП по количеству рейсов" />
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...chartData].sort((a,b)=>b.trips-a.trips).slice(0,10)}>
                  <XAxis dataKey="route" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="trips" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="ТОП по сумме (₽)" />
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...chartData].sort((a,b)=>b.total-a.total).slice(0,10)}>
                  <XAxis dataKey="route" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Таблица маршрутов" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-2 pr-4">Маршрут</th>
                  <th className="py-2 pr-4">Рейсов</th>
                  <th className="py-2 pr-4">Водителей</th>
                  <th className="py-2 pr-4">Средняя</th>
                  <th className="py-2 pr-4">Мин</th>
                  <th className="py-2 pr-4">Макс</th>
                  <th className="py-2 pr-4">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g=> (
                  <tr key={g.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-4">{g.city_a} — {g.city_b}</td>
                    <td className="py-2 pr-4">{g.trips||0}</td>
                    <td className="py-2 pr-4">{g.drivers||0}</td>
                    <td className="py-2 pr-4">{fmt(g.avg_price)} ₽</td>
                    <td className="py-2 pr-4">{fmt(g.min_price)} ₽</td>
                    <td className="py-2 pr-4">{fmt(g.max_price)} ₽</td>
                    <td className="py-2 pr-4">{fmt(g.total_price)} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

/**
 * =====================
 * TAB 5: Поиск перевозки
 * =====================
 */
const SearchTab: React.FC = () => {
  const [query, setQ] = useState({origin:"", destination:""});
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async ()=>{
    if(!query.origin || !query.destination) return;
    setLoading(true);
    const data = await api<any[]>(`/carriers/search?origin=${encodeURIComponent(query.origin)}&destination=${encodeURIComponent(query.destination)}`);
    setRows(data); setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Поиск перевозки</h1>
      <Card>
        <CardHeader title="Параметры поиска" right={<Button variant="outline" onClick={search}>{loading?"Поиск…":"Найти"}</Button>} />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Откуда" value={query.origin} onChange={e=>setQ(v=>({...v, origin:e.target.value}))} />
            <Input placeholder="Куда" value={query.destination} onChange={e=>setQ(v=>({...v, destination:e.target.value}))} />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3">
        {rows.map((r, idx)=> (
          <Card key={idx}>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>#{r.carrier_id}</Badge>
                <Badge>{r.name}</Badge>
                <Badge>{r.phone||"—"}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.path?.map((c:string, i:number)=> (
                  <React.Fragment key={i}>
                    <Badge>{c}</Badge>
                    {i<r.path.length-1 && <span className="text-zinc-400">→</span>}
                  </React.Fragment>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
        {(!loading && rows.length===0) && <p className="text-sm text-zinc-500">Ничего не найдено. Уточните города и попробуйте ещё раз.</p>}
      </div>
    </div>
  );
};

/**
 * =====================
 * APP SHELL
 * =====================
 */
export default function Page(){
  const {dark, toggle} = useDarkMode();
  const [authed, setAuthed] = useState<boolean>(false);

  useEffect(()=>{
    const t = localStorage.getItem("token");
    setAuthed(!!t);
  },[]);

  if(!authed) return <AuthPanel onLogged={()=>setAuthed(true)} />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-zinc-900 dark:bg-zinc-100" />
            <div>
              <div className="font-semibold tracking-tight">Диспетчер перевозок</div>
              <div className="text-xs text-zinc-500">API: {API_URL}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={toggle}>{dark?"🌙 Тёмная":"☀️ Светлая"}</Button>
            <Button variant="outline" onClick={()=>{localStorage.removeItem("token"); location.reload();}}>Выйти</Button>
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          {id:"routes", title:"Маршрут", content:<RoutesTab />},
          {id:"drivers", title:"Водители", content:<DriversTab />},
          {id:"deals", title:"Сделки", content:<DealsTab />},
          {id:"dashboard", title:"Дашборд", content:<DashboardTab />},
          {id:"search", title:"Поиск перевозки", content:<SearchTab />},
        ]}
      />

      <footer className="max-w-7xl mx-auto px-4 py-10 text-xs text-zinc-500">
        © {new Date().getFullYear()} Перевозки. Все права защищены.
      </footer>
    </div>
  );
}
