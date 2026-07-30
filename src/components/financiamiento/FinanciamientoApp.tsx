"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Gestion,
  Flujo,
  listarGestiones,
  crearGestion,
  actualizarGestion,
  setUso,
  eliminarGestion,
  ASESORES,
  clientesDeAsesor,
  todosLosClientes,
  esClienteDelPadron,
  ESTADOS,
  OPERACIONES,
  ENTIDADES,
  MONEDAS,
  MOTIVOS_CIERRE,
  ACCIONES_RAPIDAS,
  cierraA,
  fmtMonto,
  fmtFecha,
  parseMonto,
  diasCliente,
  diasGestion,
  diasSinUso,
} from "@/lib/financiamiento";

type Tab = "PROCESO" | "APROBADA" | "HISTORICO" | "DOCS";

export default function FinanciamientoApp() {
  const [rows, setRows] = useState<Gestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("PROCESO");
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [editar, setEditar] = useState<Gestion | null>(null);
  const [toast, setToast] = useState("");

  async function recargar() {
    setLoading(true);
    setError("");
    try {
      setRows(await listarGestiones());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 4200);
  }

  const enProceso = useMemo(() => rows.filter((r) => r.flujo === "PROCESO"), [rows]);
  const aprobadas = useMemo(() => rows.filter((r) => r.flujo === "APROBADA"), [rows]);
  const historico = useMemo(() => rows.filter((r) => r.f_cierre), [rows]);

  const lista = tab === "PROCESO" ? enProceso : tab === "APROBADA" ? aprobadas : historico;

  // KPIs
  const montoEnGestionARS = enProceso
    .filter((r) => r.moneda === "ARS")
    .reduce((a, r) => a + (r.monto || 0), 0);
  const montoEnGestionUSD = enProceso
    .filter((r) => r.moneda === "USD")
    .reduce((a, r) => a + (r.monto || 0), 0);
  const aprobadoARS = aprobadas
    .filter((r) => r.moneda === "ARS")
    .reduce((a, r) => a + (r.monto || 0), 0);
  const aprobadoUSD = aprobadas
    .filter((r) => r.moneda === "USD")
    .reduce((a, r) => a + (r.monto || 0), 0);
  const clientesLentos = enProceso.filter((r) => (diasCliente(r) ?? 0) > 10).length;

  return (
    <div style={S.wrap}>
      {/* Encabezado */}
      <div style={S.head}>
        <div>
          <div style={S.kicker}>Amauta · Gestiones</div>
          <h1 style={S.h1}>
            Tablero de <span style={{ color: "var(--accent)" }}>Financiamiento</span>
          </h1>
          <p style={S.sub}>
            Seguimiento de gestiones (SGR / BCO / ALyC). Los clientes salen del CRM.
          </p>
        </div>
        <button style={S.btnPrimary} onClick={() => setNuevaOpen(true)}>
          ＋ Nueva gestión
        </button>
      </div>

      {/* KPIs (no en la vista de documentación) */}
      {tab !== "DOCS" && (
        <div style={S.kpis}>
          <Kpi label="Gestiones en proceso" value={String(enProceso.length)} highlight />
          <Kpi label="En gestión (ARS)" value={fmtMonto(montoEnGestionARS, "ARS")} />
          {montoEnGestionUSD > 0 && <Kpi label="En gestión (USD)" value={fmtMonto(montoEnGestionUSD, "USD")} />}
          <Kpi label="Líneas aprobadas" value={String(aprobadas.length)} />
          <Kpi label="Aprobado (ARS)" value={fmtMonto(aprobadoARS, "ARS")} />
          {aprobadoUSD > 0 && <Kpi label="Aprobado (USD)" value={fmtMonto(aprobadoUSD, "USD")} />}
          <Kpi label="+10 días sin responder" value={String(clientesLentos)} warn={clientesLentos > 0} />
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        <TabBtn active={tab === "PROCESO"} onClick={() => setTab("PROCESO")}>
          En proceso <b>{enProceso.length}</b>
        </TabBtn>
        <TabBtn active={tab === "APROBADA"} onClick={() => setTab("APROBADA")}>
          Aprobadas <b>{aprobadas.length}</b>
        </TabBtn>
        <TabBtn active={tab === "HISTORICO"} onClick={() => setTab("HISTORICO")}>
          Histórico <b>{historico.length}</b>
        </TabBtn>
        <TabBtn active={tab === "DOCS"} onClick={() => setTab("DOCS")}>
          📋 Documentación SGR
        </TabBtn>
      </div>

      {error && tab !== "DOCS" && <div style={S.errorBox}>{error}</div>}

      {tab === "DOCS" ? (
        <ChecklistSGR />
      ) : loading ? (
        <div style={S.empty}>Cargando gestiones…</div>
      ) : lista.length === 0 ? (
        <div style={S.empty}>
          {tab === "PROCESO"
            ? "No hay gestiones en curso. Cargá una con “Nueva gestión”."
            : tab === "APROBADA"
            ? "Todavía no hay líneas aprobadas."
            : "El histórico está vacío."}
        </div>
      ) : (
        <Tabla tab={tab} rows={lista} onEditar={setEditar} onUso={async (g, u) => {
          try {
            const upd = await setUso(g, u);
            setRows((prev) => prev.map((r) => (r.id === upd.id ? upd : r)));
          } catch (e) {
            flash(e instanceof Error ? e.message : "Error");
          }
        }} />
      )}

      {nuevaOpen && (
        <FormNueva
          onClose={() => setNuevaOpen(false)}
          onSaved={(g) => {
            setRows((prev) => [g, ...prev]);
            setNuevaOpen(false);
            setTab("PROCESO");
            flash(`Gestión #${g.id} cargada — ${g.cliente}.`);
          }}
        />
      )}

      {editar && (
        <FormActualizar
          gestion={editar}
          onClose={() => setEditar(null)}
          onSaved={(g, msg) => {
            setRows((prev) => prev.map((r) => (r.id === g.id ? g : r)));
            setEditar(null);
            flash(msg);
          }}
          onDeleted={(id, cliente) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            setEditar(null);
            flash(`Gestión eliminada — ${cliente}.`);
          }}
        />
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ===========================================================================
// TABLA
// ===========================================================================
function Tabla({
  tab,
  rows,
  onEditar,
  onUso,
}: {
  tab: Tab;
  rows: Gestion[];
  onEditar: (g: Gestion) => void;
  onUso: (g: Gestion, uso: string) => void;
}) {
  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>Asesor</Th>
            <Th>Operación</Th>
            <Th right>Monto</Th>
            <Th>Entidad</Th>
            {tab === "PROCESO" && <Th>Estado</Th>}
            {tab === "PROCESO" && <Th right>Días cli.</Th>}
            {tab === "PROCESO" && <Th right>Días gest.</Th>}
            {tab === "APROBADA" && <Th>Uso</Th>}
            {tab === "APROBADA" && <Th right>Días s/uso</Th>}
            {tab === "HISTORICO" && <Th>Estado final</Th>}
            {tab === "HISTORICO" && <Th>Motivo</Th>}
            {tab === "HISTORICO" && <Th>Cierre</Th>}
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const dc = diasCliente(g);
            const dg = diasGestion(g);
            const du = diasSinUso(g);
            return (
              <tr key={g.id} style={S.tr}>
                <Td>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{g.cliente}</div>
                  {g.cliente_nuevo && <span style={S.tagNuevo}>nuevo</span>}
                </Td>
                <Td>{g.asesor || "—"}</Td>
                <Td>{g.operacion || "—"}</Td>
                <Td right>{fmtMonto(g.monto, g.moneda)}</Td>
                <Td>{g.entidad || "—"}</Td>
                {tab === "PROCESO" && (
                  <Td>
                    <span style={S.estadoChip}>{g.estado || "—"}</span>
                  </Td>
                )}
                {tab === "PROCESO" && (
                  <Td right>
                    <span style={dc !== null && dc > 10 ? S.diasWarn : undefined}>{dc ?? "—"}</span>
                  </Td>
                )}
                {tab === "PROCESO" && (
                  <Td right>
                    <span style={dg !== null && dg > 15 ? S.diasWarn : undefined}>{dg ?? "—"}</span>
                  </Td>
                )}
                {tab === "APROBADA" && (
                  <Td>
                    <select
                      value={g.uso || "SIN USO"}
                      onChange={(e) => onUso(g, e.target.value)}
                      style={{ ...S.miniSelect, color: g.uso === "ACTIVO" ? "var(--success)" : "var(--warning)" }}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="SIN USO">SIN USO</option>
                    </select>
                  </Td>
                )}
                {tab === "APROBADA" && (
                  <Td right>
                    <span style={du !== null && du > 60 ? S.diasWarn : undefined}>{du ?? "—"}</span>
                  </Td>
                )}
                {tab === "HISTORICO" && (
                  <Td>
                    <span style={S.estadoChip}>{g.estado || "—"}</span>
                  </Td>
                )}
                {tab === "HISTORICO" && <Td>{g.motivo || "—"}</Td>}
                {tab === "HISTORICO" && <Td>{fmtFecha(g.f_cierre)}</Td>}
                <Td>
                  {tab === "PROCESO" ? (
                    <button style={S.btnGhost} onClick={() => onEditar(g)}>
                      Actualizar
                    </button>
                  ) : (
                    <button style={{ ...S.btnGhost, opacity: 0.7 }} onClick={() => onEditar(g)}>
                      Ver
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// FORMULARIO — NUEVA GESTIÓN
// ===========================================================================
function FormNueva({ onClose, onSaved }: { onClose: () => void; onSaved: (g: Gestion) => void }) {
  const [asesor, setAsesor] = useState("");
  const [verTodos, setVerTodos] = useState(false);
  const [cliente, setCliente] = useState("");
  const [sug, setSug] = useState<string[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [fPedido, setFPedido] = useState("");
  const [fRecep, setFRecep] = useState("");
  const [fEnvio, setFEnvio] = useState("");
  const [envioAuto, setEnvioAuto] = useState(true);
  const [operacion, setOperacion] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [entidad, setEntidad] = useState("");
  const [estado, setEstado] = useState("PENDIENTE CLIENTE");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cartera = useMemo(
    () => (verTodos ? todosLosClientes() : asesor ? clientesDeAsesor(asesor) : []),
    [asesor, verTodos]
  );

  function buscar(q: string) {
    setCliente(q);
    const t = q.trim().toUpperCase();
    if (t.length < 2) {
      setSug([]);
      setSugOpen(false);
      return;
    }
    const m = cartera.filter((c) => c.toUpperCase().includes(t)).slice(0, 12);
    setSug(m);
    setSugOpen(m.length > 0);
  }

  const enPadron = cliente.trim() !== "" && esClienteDelPadron(cliente);

  async function guardar() {
    setErr("");
    setBusy(true);
    try {
      const g = await crearGestion({
        cliente,
        cliente_nuevo: cliente.trim() !== "" && !enPadron,
        asesor,
        operacion,
        monto: parseMonto(monto),
        moneda,
        entidad,
        f_pedido: fPedido,
        f_recep: fRecep,
        f_envio: fEnvio,
        estado,
        obs,
      });
      onSaved(g);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Nueva gestión" onClose={onClose}>
      <p style={S.modalSub}>Elegí el asesor y después escribí dos letras del cliente.</p>

      <div style={S.paso}>
        <div style={S.pasoN}>PASO 1</div>
        <Field label="Asesor" req>
          <select
            style={S.input}
            value={asesor}
            onChange={(e) => {
              setAsesor(e.target.value);
              setCliente("");
              setSugOpen(false);
            }}
          >
            <option value="">— elegir asesor —</option>
            {ASESORES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cliente" req>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...S.input, opacity: asesor ? 1 : 0.45 }}
              disabled={!asesor}
              value={cliente}
              placeholder={
                !asesor
                  ? "elegí primero el asesor"
                  : cartera.length
                  ? `escribí 2 letras — ${cartera.length} clientes`
                  : "sin clientes en su cartera — escribilo a mano"
              }
              onChange={(e) => buscar(e.target.value)}
              onFocus={() => sug.length && setSugOpen(true)}
              onBlur={() => setTimeout(() => setSugOpen(false), 150)}
              autoComplete="off"
            />
            {sugOpen && (
              <div style={S.sugBox}>
                {sug.map((n) => (
                  <div
                    key={n}
                    style={S.sugItem}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCliente(n);
                      setSugOpen(false);
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            )}
          </div>
          {cliente.trim() && (
            <div style={{ fontSize: 12, marginTop: 5, color: enPadron ? "var(--success)" : "var(--warning)" }}>
              {enPadron ? "✓ está en el padrón" : "cliente nuevo — se carga tal como lo escribís"}
            </div>
          )}
          <label style={S.chk}>
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            Ver todo el padrón, no solo la cartera de este asesor
          </label>
        </Field>
      </div>

      {asesor && (
        <div style={S.paso}>
          <div style={S.pasoN}>PASO 2</div>

          <div style={{ marginTop: 12 }}>
            <label style={S.label}>Carga rápida</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {ACCIONES_RAPIDAS.map((a) => {
                const activa = operacion === a.operacion && entidad === a.entidad;
                return (
                  <button
                    key={a.label}
                    type="button"
                    style={{ ...S.rapida, ...(activa ? S.rapidaActiva : {}) }}
                    onClick={() => {
                      setOperacion(a.operacion);
                      setEntidad(a.entidad);
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={S.row}>
            <Field label="Fecha pedido de documentación" req>
              <input type="date" style={S.input} value={fPedido} onChange={(e) => setFPedido(e.target.value)} />
            </Field>
            <Field label="Fecha recepción documentación">
              <input
                type="date"
                style={S.input}
                value={fRecep}
                onChange={(e) => {
                  setFRecep(e.target.value);
                  if (envioAuto) setFEnvio(e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Fecha envío de documentación a SGR/BCO">
            <input
              type="date"
              style={S.input}
              value={fEnvio}
              onChange={(e) => {
                setEnvioAuto(false);
                setFEnvio(e.target.value);
              }}
            />
          </Field>
          <div style={S.row}>
            <Field label="Operación">
              <SelectOpc value={operacion} onChange={setOperacion} options={OPERACIONES} />
            </Field>
            <Field label="Monto">
              <input style={S.input} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="1.500.000" />
            </Field>
            <Field label="Moneda" flex="0 0 90px">
              <select style={S.input} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div style={S.row}>
            <Field label="SGR / BCO / ALYC">
              <SelectOpc value={entidad} onChange={setEntidad} options={ENTIDADES} />
            </Field>
            <Field label="Estado actual" req>
              <select style={S.input} value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS.map((s) => (
                  <option key={s} value={s} disabled={!!cierraA(s)}>
                    {s}
                    {cierraA(s) ? " (cierra — usar Actualizar)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Observación">
            <textarea style={{ ...S.input, minHeight: 56, resize: "vertical" }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Queda registrada con tu mail y la fecha." />
          </Field>
        </div>
      )}

      {err && <div style={S.errBox}>{err}</div>}
      <div style={S.acciones}>
        <button style={{ ...S.btnPrimary, opacity: !asesor || !cliente.trim() || busy ? 0.5 : 1 }} disabled={!asesor || !cliente.trim() || busy} onClick={guardar}>
          {busy ? "Guardando…" : "Guardar gestión"}
        </button>
        <button style={S.btnCancel} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

// ===========================================================================
// FORMULARIO — ACTUALIZAR / CERRAR
// ===========================================================================
function FormActualizar({
  gestion,
  onClose,
  onSaved,
  onDeleted,
}: {
  gestion: Gestion;
  onClose: () => void;
  onSaved: (g: Gestion, msg: string) => void;
  onDeleted: (id: number, cliente: string) => void;
}) {
  const readOnly = gestion.flujo !== "PROCESO";
  const [confirmDel, setConfirmDel] = useState(false);
  const [busyDel, setBusyDel] = useState(false);
  const [fRecep, setFRecep] = useState(gestion.f_recep || "");
  const [fEnvio, setFEnvio] = useState(gestion.f_envio || "");
  const [envioAuto, setEnvioAuto] = useState(!gestion.f_envio);
  const [fResol, setFResol] = useState(gestion.f_resol || "");
  const [operacion, setOperacion] = useState(gestion.operacion || "");
  const [monto, setMonto] = useState(gestion.monto != null ? String(gestion.monto) : "");
  const [moneda, setMoneda] = useState(gestion.moneda || "ARS");
  const [entidad, setEntidad] = useState(gestion.entidad || "");
  const [asesor, setAsesor] = useState(gestion.asesor || "");
  const [estado, setEstado] = useState(gestion.estado || "");
  const [motivo, setMotivo] = useState(gestion.motivo || "");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cierre = cierraA(estado);

  async function borrar() {
    setBusyDel(true);
    setErr("");
    try {
      await eliminarGestion(gestion.id);
      onDeleted(gestion.id, gestion.cliente);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar.");
      setBusyDel(false);
      setConfirmDel(false);
    }
  }

  async function guardar() {
    setErr("");
    setBusy(true);
    try {
      const g = await actualizarGestion(gestion, {
        f_recep: fRecep,
        f_envio: fEnvio,
        f_resol: fResol,
        operacion,
        entidad,
        asesor,
        monto: parseMonto(monto),
        moneda,
        estado,
        motivo,
        obs,
      });
      let msg = `Gestión actualizada — ${g.cliente} · ${g.estado}.`;
      if (cierre === "APR") msg = `${g.cliente} → ${g.estado}. Copiada a Aprobadas e Histórico.`;
      if (cierre === "HIST") msg = `${g.cliente} → ${g.estado}. Guardada en Histórico.`;
      onSaved(g, msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal title={readOnly ? `Gestión #${gestion.id}` : "Actualizar gestión"} onClose={onClose}>
      <p style={S.modalSub}>
        <b style={{ color: "var(--text-primary)" }}>{gestion.cliente}</b>
        {gestion.asesor ? ` · ${gestion.asesor}` : ""}
        {readOnly ? " — solo lectura (gestión cerrada)." : " — modificá solo lo que cambió."}
      </p>

      <div style={S.row}>
        <Field label="Fecha recepción documentación">
          <input type="date" style={S.input} disabled={readOnly} value={fRecep} onChange={(e) => { setFRecep(e.target.value); if (envioAuto) setFEnvio(e.target.value); }} />
        </Field>
        <Field label="Fecha envío a SGR/BCO">
          <input type="date" style={S.input} disabled={readOnly} value={fEnvio} onChange={(e) => { setEnvioAuto(false); setFEnvio(e.target.value); }} />
        </Field>
      </div>

      <div style={S.row}>
        <Field label="Operación">
          <SelectOpc value={operacion} onChange={setOperacion} options={OPERACIONES} disabled={readOnly} />
        </Field>
        <Field label="Monto">
          <input style={S.input} disabled={readOnly} value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Field>
        <Field label="Moneda" flex="0 0 90px">
          <select style={S.input} disabled={readOnly} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <div style={S.row}>
        <Field label="SGR / BCO / ALYC">
          <SelectOpc value={entidad} onChange={setEntidad} options={ENTIDADES} disabled={readOnly} />
        </Field>
        <Field label="Asesor">
          <select style={S.input} disabled={readOnly} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
            <option value="">—</option>
            {ASESORES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Estado actual">
        <select style={S.input} disabled={readOnly} value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">—</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      {!readOnly && cierre && (
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>CIERRE DE GESTIÓN</legend>
          {cierre === "APR" ? (
            <>
              <Field label="Fecha de resolución" req>
                <input type="date" style={S.input} value={fResol} onChange={(e) => setFResol(e.target.value)} />
              </Field>
              <div style={S.avisoApr}>
                Al guardar: pasa a <b>Aprobadas</b> (SIN USO) y queda en Histórico. Sale de En proceso.
              </div>
            </>
          ) : (
            <>
              <Field label="Motivo de cierre" req>
                <input list="motivos" style={S.input} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="No calificó, desistió…" />
                <datalist id="motivos">{MOTIVOS_CIERRE.map((m) => <option key={m} value={m} />)}</datalist>
              </Field>
              <div style={S.avisoHist}>Al guardar: se archiva en <b>Histórico</b> con el motivo. Sale de En proceso.</div>
            </>
          )}
        </fieldset>
      )}

      {!readOnly && (
        <Field label="Agregar observación">
          <textarea style={{ ...S.input, minHeight: 50, resize: "vertical" }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Se suma con tu mail y la fecha de hoy." />
        </Field>
      )}

      {gestion.obs && (
        <div style={S.previa}>
          <div style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Observaciones cargadas:</div>
          {gestion.obs}
        </div>
      )}

      {err && <div style={S.errBox}>{err}</div>}
      <div style={S.acciones}>
        {!readOnly && (
          <button style={{ ...S.btnPrimary, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={guardar}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        )}
        <button style={S.btnCancel} onClick={onClose}>{readOnly ? "Cerrar" : "Cancelar"}</button>

        {confirmDel ? (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>¿Eliminar definitivamente?</span>
            <button style={{ ...S.btnDanger, opacity: busyDel ? 0.5 : 1 }} disabled={busyDel} onClick={borrar}>
              {busyDel ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button style={S.btnGhost} onClick={() => setConfirmDel(false)}>No</button>
          </div>
        ) : (
          <button style={{ ...S.btnGhostDanger, marginLeft: "auto" }} onClick={() => setConfirmDel(true)}>
            🗑 Eliminar
          </button>
        )}
      </div>
    </Modal>
  );
}

// ===========================================================================
// CHECK LIST DOCUMENTACIÓN SGR (Persona Jurídica)
// ===========================================================================
const DOCS_ENVIAR = [
  "Estatuto o Contrato Social con inscripción en IGJ, Registro Público de Comercio o Direcciones Provinciales.",
  "Acta de Asamblea que aprueba Estados Contables y distribución de utilidades (solo SRL y SA).",
  "Acta de Directorio con designación de cargos vigentes.",
  "Últimos dos Estados Contables comparativos: cerrados, períodos de 12 meses, auditados y certificados.",
  "Manifestación de bienes de socios actualizada, firmada por titular y contador público, + última DDJJ de Bienes Personales + papeles de trabajo ARCA.",
  "Detalle de ventas y compras (netas de IVA): mensuales del último balance y postbalance, actualizado al mes anterior.",
  "Detalle de deuda bancaria, financiera y con otras SGR: actualizado hasta el mes anterior al de curso.",
  "Certificado MiPyME vigente.",
  "Breve reseña de la empresa.",
  "Último F931.",
  "Composición accionaria actualizada con datos de socios (celular y casilla de mail).",
  "Copia de DNI de los socios.",
];
const DOCS_AGRO = [
  "Plan de siembra / planteo productivo (campos propios y arrendados).",
  "IP1 – Campaña de Invierno / IP2 – Campaña de Verano.",
  "Score SISA (servicioscf.afip.gob.ar/Registros/sisa).",
  "Stock de hacienda (de corresponder).",
];
const DOCS_OBJETIVO = [
  "Descuento de CPD propios / terceros (informar libradores con CUIT).",
  "Pagaré Bursátil.",
  "Aval Bancario (especificar condiciones del préstamo y bancos calificados).",
];
const DOCS_CONTRAGARANTIAS = ["Prenda de títulos.", "Hipotecas.", "Otras."];

function checklistTexto(): string {
  const L: string[] = [];
  L.push("CHECK LIST PARA CALIFICAR CON LAS SGR — PERSONA JURÍDICA");
  L.push("Amauta Inversiones Financieras\n");
  L.push("DOCUMENTACIÓN A ENVIAR:");
  DOCS_ENVIAR.forEach((d, i) => L.push(`${i + 1}. ${d}`));
  L.push("\nSI ES EMPRESA CONSTRUCTORA (solo si corresponde):");
  L.push("- Detalle de obras en curso con grado de avance y comitentes.");
  L.push("\nSI ES ACTIVIDAD AGROPECUARIA:");
  DOCS_AGRO.forEach((d) => L.push(`- ${d}`));
  L.push("\nOBJETIVO FINANCIERO (cuantificar el requerimiento):");
  DOCS_OBJETIVO.forEach((d) => L.push(`- ${d}`));
  L.push("\nCONTRAGARANTÍAS (siempre se ofrece la fianza de todos los socios en primera instancia):");
  DOCS_CONTRAGARANTIAS.forEach((d) => L.push(`- ${d}`));
  L.push("\nSi ya operan con SGRs, indicar con cuáles.");
  L.push("\nAmauta Inversiones Financieras · CNV Mat. 1029 · amautainversiones.com");
  return L.join("\n");
}

const LOGO_SVG =
  '<svg width="52" height="52" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg"><polygon points="96,20 172,96 96,172 20,96" fill="#F3CF11"/><g stroke="#231F20" stroke-width="9" stroke-linecap="round"><line x1="96" y1="56" x2="96" y2="136"/><line x1="56" y1="96" x2="136" y2="96"/><line x1="124.3" y1="67.7" x2="67.7" y2="124.3"/><line x1="67.7" y1="67.7" x2="124.3" y2="124.3"/></g></svg>';

// Abre una versión imprimible (con logo Amauta) y dispara el diálogo de impresión,
// donde el asesor puede elegir "Guardar como PDF".
function descargarChecklistPDF() {
  const w = window.open("", "_blank");
  if (!w) return;
  const items = DOCS_ENVIAR.map(
    (d, i) => `<div class="it"><span class="n">${i + 1}</span><span>${d}</span></div>`
  ).join("");
  const agro = DOCS_AGRO.map((d) => `<li>${d}</li>`).join("");
  const obj = DOCS_OBJETIVO.map((d) => `<li>${d}</li>`).join("");
  const contra = DOCS_CONTRAGARANTIAS.map((d) => `<li>${d}</li>`).join("");
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Check List SGR - Persona Juridica - Amauta</title>
<style>
  *{box-sizing:border-box} body{font-family:'Fira Sans',Arial,sans-serif;color:#231F20;margin:0;padding:0;font-size:12px}
  .head{background:#231F20;color:#fff;padding:22px 34px;display:flex;align-items:center;gap:16px}
  .head h1{font-size:18px;margin:0;font-weight:800} .head .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#F3CF11;font-weight:800}
  .body{padding:26px 34px}
  .accent{color:#621044}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #F3CF11;padding-bottom:6px;margin:20px 0 12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
  .it{display:flex;gap:9px;align-items:flex-start;break-inside:avoid}
  .it .n{flex:0 0 20px;width:20px;height:20px;border-radius:50%;background:#F3CF11;color:#231F20;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .card{border:1px solid #ddd;border-top:3px solid #621044;border-radius:8px;padding:12px 14px;break-inside:avoid}
  .card h3{margin:0 0 8px;font-size:13px} ul{margin:6px 0 0;padding-left:18px} li{margin-bottom:5px;line-height:1.45}
  .nota{background:#fff8dc;border:1px solid #F3CF11;border-radius:8px;padding:10px 12px;margin-top:16px;font-weight:600}
  .foot{margin-top:20px;border-top:1px solid #ddd;padding-top:12px;color:#666;font-size:10.5px}
  @media print{.card,.it{break-inside:avoid}}
</style></head><body>
<div class="head">${LOGO_SVG}<div><div class="k">Amauta Inversiones Financieras</div><h1>Check List para calificar con las SGR — Persona Jurídica</h1></div></div>
<div class="body">
  <h2>Documentación a enviar</h2>
  <div class="grid">${items}</div>
  <div class="cards" style="margin-top:18px">
    <div class="card"><h3>🏗️ Empresa constructora <span style="font-size:10px;color:#a06a00">(solo si corresponde)</span></h3><ul><li>Detalle de obras en curso con grado de avance y comitentes.</li></ul></div>
    <div class="card"><h3>🌾 Actividad agropecuaria <span style="font-size:10px;color:#2f7d4f">(si aplica)</span></h3><ul>${agro}</ul></div>
  </div>
  <div class="cards" style="margin-top:16px">
    <div class="card" style="border-top-color:#F3CF11"><h3>🎯 Objetivo financiero</h3><ul>${obj}</ul></div>
    <div class="card"><h3>🛡️ Contragarantías</h3><div style="font-size:11px;color:#444">Siempre se ofrece la fianza de todos los socios en primera instancia. Otras opciones:</div><ul>${contra}</ul></div>
  </div>
  <div class="nota">✳️ Si ya operan con SGRs, es importante que nos indiquen con cuáles.</div>
  <div class="foot">Equipo Amauta Inversiones Financieras · CNV Mat. 1029 · amautainversiones.com</div>
</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 500);
}

function ChecklistSGR() {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(checklistTexto());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* noop */
    }
  }
  return (
    <div style={D.wrap}>
      {/* Banner */}
      <div style={D.banner}>
        <div>
          <div style={D.bannerKicker}>Amauta · Financiamiento</div>
          <h2 style={D.bannerTitle}>
            Check List para calificar con las SGR — <span style={{ color: "var(--accent)" }}>Persona Jurídica</span>
          </h2>
          <p style={D.bannerSub}>Documentación a presentar para iniciar la calificación.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={D.copyBtn} onClick={copiar}>
            {copiado ? "✓ Copiado" : "📋 Copiar para enviar"}
          </button>
          <button style={D.pdfBtn} onClick={descargarChecklistPDF}>
            ⬇ Descargar PDF
          </button>
        </div>
      </div>

      {/* Documentación a enviar */}
      <div style={D.sectionTitle}>Documentación a enviar</div>
      <div style={D.grid2}>
        {DOCS_ENVIAR.map((d, i) => (
          <div key={i} style={D.item}>
            <span style={D.num}>{i + 1}</span>
            <span style={D.itemText}>{d}</span>
          </div>
        ))}
      </div>

      {/* Constructora / Agro */}
      <div style={D.cards2}>
        <div style={D.card}>
          <div style={D.cardHead}>
            🏗️ Empresa constructora <span style={D.badgeAmber}>solo si corresponde</span>
          </div>
          <ul style={D.ul}>
            <li style={D.li}>Detalle de obras en curso con grado de avance y comitentes.</li>
          </ul>
        </div>
        <div style={D.card}>
          <div style={D.cardHead}>
            🌾 Actividad agropecuaria <span style={D.badgeGreen}>si aplica</span>
          </div>
          <ul style={D.ul}>
            {DOCS_AGRO.map((d, i) => (
              <li key={i} style={D.li}>{d}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Objetivo / Contragarantías */}
      <div style={D.cards2}>
        <div style={{ ...D.card, borderTopColor: "var(--accent)" }}>
          <div style={D.cardHead}>🎯 Objetivo financiero</div>
          <p style={D.cardP}>
            Es fundamental especificar el objetivo financiero que busca la empresa y cuantificar el requerimiento:
          </p>
          <ul style={D.ul}>
            {DOCS_OBJETIVO.map((d, i) => (
              <li key={i} style={D.li}>{d}</li>
            ))}
          </ul>
        </div>
        <div style={{ ...D.card, borderTopColor: "var(--brand-bordo)" }}>
          <div style={D.cardHead}>🛡️ Contragarantías</div>
          <p style={D.cardP}>
            Para evaluar opciones con las SGR necesitamos entender qué contragarantías puede ofrecer. Siempre se ofrece
            la <b style={{ color: "var(--text-primary)" }}>fianza de todos los socios</b> en primera instancia. Otras opciones:
          </p>
          <ul style={D.ul}>
            {DOCS_CONTRAGARANTIAS.map((d, i) => (
              <li key={i} style={D.li}>{d}</li>
            ))}
          </ul>
        </div>
      </div>

      <div style={D.nota}>✳️ Si ya operan con SGRs, es importante que nos indiquen con cuáles.</div>

      {/* Alta en ePyme (requisito para operar en MAV) */}
      <div style={D.epyme}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={D.cardHead}>📄 Alta en ePyme <span style={D.badgeAmber}>requisito para MAV</span></div>
          <p style={D.cardP}>
            Para operar en el <b style={{ color: "var(--text-primary)" }}>MAV</b> (descuento de cheques / CPD y otros
            instrumentos), la empresa debe estar <b style={{ color: "var(--text-primary)" }}>dada de alta en ePyme</b>.
            Si todavía no lo está, descargá el instructivo con el paso a paso.
          </p>
        </div>
        <a href="/docs/instructivo-epyme.pdf" target="_blank" rel="noopener noreferrer" style={D.epymeBtn}>
          ⬇ Descargar instructivo ePyme (PDF)
        </a>
      </div>

      <div style={D.footer}>
        Equipo <b style={{ color: "var(--text-secondary)" }}>Amauta Inversiones Financieras</b> · CNV Mat. 1029 · Ante
        cualquier consulta, no dudes en contactarnos · amautainversiones.com
      </div>
    </div>
  );
}

// ===========================================================================
// PRIMITIVOS UI
// ===========================================================================
function Kpi({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div style={{ ...S.kpi, borderTopColor: warn ? "var(--danger)" : highlight ? "var(--accent)" : "var(--brand-bordo)" }}>
      <div style={{ ...S.kpiVal, color: warn ? "var(--danger)" : "var(--text-primary)" }}>{value}</div>
      <div style={S.kpiLbl}>{label}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...S.tab, ...(active ? S.tabActive : {}) }}>
      {children}
    </button>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ ...S.th, textAlign: right ? "right" : "left" }}>{children}</th>;
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td style={{ ...S.td, textAlign: right ? "right" : "left" }}>{children}</td>;
}

/** Select con las opciones dadas; si el valor actual no está en la lista, lo incluye igual. */
function SelectOpc({
  value,
  onChange,
  options,
  disabled,
  placeholder = "— elegir —",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select style={S.input} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Field({ label, req, children, flex }: { label: string; req?: boolean; children: React.ReactNode; flex?: string }) {
  return (
    <div style={{ flex: flex || 1, marginTop: 12 }}>
      <label style={S.label}>
        {label} {req && <span style={{ color: "var(--accent)" }}>•</span>}
      </label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={S.overlay} onMouseDown={onClose}>
      <div style={S.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <h2 style={S.modalTitle}>
            <span style={S.diamond} />
            {title}
          </h2>
          <button style={S.xBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={S.modalBody}>{children}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// ESTILOS
// ===========================================================================
const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1400, margin: "0 auto" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  kicker: { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--accent)", fontWeight: 800, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.15 },
  sub: { color: "var(--text-secondary)", fontSize: 14, margin: "6px 0 0" },
  kpis: { display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 },
  kpi: { flex: "1 1 160px", minWidth: 150, background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderTop: "3px solid var(--brand-bordo)", borderRadius: 14, padding: "14px 16px" },
  kpiVal: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kpiLbl: { fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
  tabs: { display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid var(--brand-border)", paddingBottom: 0 },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--text-secondary)", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "10px 14px", cursor: "pointer" },
  tabActive: { color: "var(--text-primary)", borderBottomColor: "var(--accent)" },
  empty: { padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)", background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderRadius: 14 },
  errorBox: { padding: "12px 14px", background: "rgba(216,67,78,0.15)", border: "1px solid var(--danger)", color: "#F0A0A6", borderRadius: 10, marginBottom: 14 },
  tableWrap: { overflowX: "auto", background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderRadius: 14 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { padding: "12px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700, borderBottom: "1px solid var(--brand-border)", whiteSpace: "nowrap" },
  td: { padding: "11px 14px", borderBottom: "1px solid var(--brand-border)", color: "var(--text-secondary)", verticalAlign: "middle" },
  tr: {},
  tagNuevo: { display: "inline-block", marginTop: 3, fontSize: 10, fontWeight: 700, color: "var(--warning)", background: "rgba(232,181,74,0.14)", padding: "1px 7px", borderRadius: 10 },
  estadoChip: { display: "inline-block", fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)", background: "var(--surface-overlay)", border: "1px solid var(--brand-border)", padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap" },
  diasWarn: { color: "var(--danger)", fontWeight: 700 },
  miniSelect: { background: "var(--surface-overlay)", border: "1px solid var(--brand-border)", borderRadius: 8, padding: "4px 8px", fontFamily: "inherit", fontSize: 12, fontWeight: 700 },
  btnPrimary: { background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 800, padding: "11px 20px", cursor: "pointer", whiteSpace: "nowrap" },
  btnGhost: { background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 8, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" },
  btnCancel: { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--brand-border)", borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "11px 20px", cursor: "pointer" },
  btnDanger: { background: "var(--danger)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 14px", cursor: "pointer", whiteSpace: "nowrap" },
  btnGhostDanger: { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "10px 16px", cursor: "pointer", whiteSpace: "nowrap" },
  rapida: { background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 20, cursor: "pointer" },
  rapidaActiva: { background: "var(--accent)", color: "var(--on-accent)" },
  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" },
  modal: { width: "100%", maxWidth: 580, background: "var(--surface-base)", border: "1px solid var(--brand-border)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--brand-border)" },
  modalTitle: { display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 },
  diamond: { width: 10, height: 10, background: "var(--brand-bordo)", borderRadius: 2, display: "inline-block", transform: "rotate(45deg)" },
  xBtn: { background: "transparent", border: "none", color: "var(--text-tertiary)", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  modalBody: { padding: "18px 20px 22px" },
  modalSub: { color: "var(--text-secondary)", fontSize: 13, margin: "0 0 8px" },
  paso: { border: "1px solid var(--brand-border)", borderRadius: 12, padding: "2px 14px 16px", marginTop: 10, background: "var(--surface-raised)" },
  pasoN: { display: "inline-block", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, fontSize: 10.5, padding: "2px 8px", borderRadius: 20, marginTop: 12 },
  row: { display: "flex", gap: 12 },
  label: { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 },
  input: { width: "100%", padding: "9px 10px", background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--brand-border)", borderRadius: 7, fontFamily: "inherit", fontSize: 14 },
  chk: { display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)", cursor: "pointer" },
  sugBox: { position: "absolute", left: 0, right: 0, top: "100%", marginTop: 3, zIndex: 50, background: "var(--surface-overlay)", border: "1px solid var(--accent)", borderRadius: 8, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 20px rgba(0,0,0,0.45)" },
  sugItem: { padding: "8px 11px", fontSize: 13.5, cursor: "pointer", borderBottom: "1px solid var(--brand-border)", color: "var(--text-primary)" },
  fieldset: { border: "1px solid var(--warning)", borderRadius: 12, padding: "0 14px 14px", marginTop: 16 },
  legend: { fontSize: 11.5, fontWeight: 700, color: "var(--accent)", padding: "0 6px" },
  avisoApr: { background: "rgba(47,191,113,0.10)", border: "1px solid var(--success)", color: "#8FE0B4", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, marginTop: 12 },
  avisoHist: { background: "rgba(232,181,74,0.12)", border: "1px solid var(--warning)", color: "#F0D49A", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, marginTop: 12 },
  previa: { background: "var(--surface-overlay)", border: "1px solid var(--brand-border)", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 12, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" },
  errBox: { background: "rgba(216,67,78,0.15)", border: "1px solid var(--danger)", color: "#F0A0A6", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginTop: 14 },
  acciones: { display: "flex", gap: 10, marginTop: 18 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--surface-overlay)", border: "1px solid var(--success)", color: "#8FE0B4", padding: "12px 20px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 1100, maxWidth: "90vw" },
};

// Estilos del Check List de documentación SGR
const D: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1100 },
  banner: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", background: "linear-gradient(180deg, var(--surface-raised), var(--surface-base))", border: "1px solid var(--brand-border)", borderLeft: "4px solid var(--accent)", borderRadius: 14, padding: "18px 20px", marginBottom: 18 },
  bannerKicker: { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--accent)", fontWeight: 800, marginBottom: 4 },
  bannerTitle: { fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 },
  bannerSub: { fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0" },
  copyBtn: { background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 800, padding: "10px 16px", cursor: "pointer", whiteSpace: "nowrap" },
  pdfBtn: { background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "10px 16px", cursor: "pointer", whiteSpace: "nowrap" },
  epyme: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderLeft: "4px solid var(--brand-bordo)", borderRadius: 14, padding: "16px 18px", marginBottom: 18 },
  epymeBtn: { background: "var(--brand-bordo)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, padding: "12px 18px", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" },
  sectionTitle: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-primary)", margin: "6px 0 12px", paddingBottom: 8, borderBottom: "1px solid var(--brand-border)" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10, marginBottom: 20 },
  item: { display: "flex", gap: 12, alignItems: "flex-start", background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderRadius: 10, padding: "11px 13px" },
  num: { flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, fontSize: 12.5, display: "grid", placeItems: "center", marginTop: 1 },
  itemText: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 },
  cards2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 16 },
  card: { background: "var(--surface-raised)", border: "1px solid var(--brand-border)", borderTop: "3px solid var(--brand-bordo)", borderRadius: 14, padding: "16px 18px" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, flexWrap: "wrap" },
  cardP: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 10px" },
  ul: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 },
  li: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 },
  badgeAmber: { fontSize: 11, fontWeight: 700, color: "var(--warning)", background: "rgba(232,181,74,0.14)", padding: "2px 9px", borderRadius: 20 },
  badgeGreen: { fontSize: 11, fontWeight: 700, color: "var(--success)", background: "rgba(47,191,113,0.14)", padding: "2px 9px", borderRadius: 20 },
  nota: { background: "rgba(243,207,17,0.10)", border: "1px solid var(--accent)", color: "var(--text-primary)", borderRadius: 10, padding: "12px 15px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  footer: { fontSize: 12, color: "var(--text-tertiary)", borderTop: "1px solid var(--brand-border)", paddingTop: 14, lineHeight: 1.5 },
};
