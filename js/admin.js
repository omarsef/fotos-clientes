import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, firebaseConfig } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword,
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  doc, setDoc, getDoc, getDocs, addDoc, collection,
  updateDoc, increment, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists() || snap.data().role !== "admin") {
    window.location.href = "login.html"; return;
  }
  document.getElementById("adminEmail").textContent = user.email;
  init();
});

window.logout = async () => { await signOut(auth); window.location.href = "login.html"; };

// ── Tabs ─────────────────────────────────────────────────────
function init() {
  document.querySelectorAll(".sidebar a").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".sidebar a").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      a.classList.add("active");
      document.getElementById("tab-" + a.dataset.tab).classList.add("active");
      if (a.dataset.tab === "analytics") cargarAnalytics();
      if (a.dataset.tab === "proyectos") initProyectos();
      if (a.dataset.tab === "galerias") {
        popularSelectClientesGaleria();
        popularSelectGruposGaleria();
        cargarGaleriaAdmin();
      }
    });
  });

  // Sub-tabs dentro de "Subir Fotos"
  document.querySelectorAll(".subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".subtab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".subtab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("subtab-" + btn.dataset.subtab).classList.add("active");
      // Cargar grupos cuando se activa el sub-tab grupal
      if (btn.dataset.subtab === "grupal") popularSelectGruposFotosGrupales();
    });
  });

  cargarGrupos();
  cargarUsuarios();
  setupCrearGrupo();
  setupCrearUsuario();
  setupSubirFotos();
  setupGaleriaAdmin();
  setupSelecciones();
  setupAnalytics();
  setupFotosGrupales();

  // Filtro por grupo en tabla de clientes
  document.getElementById("filtroGrupoClientes").addEventListener("change", (e) => {
    cargarUsuarios(e.target.value);
  });
}

// ══════════════════════════════════════════════════════
// GRUPOS
// ══════════════════════════════════════════════════════
function setupCrearGrupo() {
  document.getElementById("btnCrearGrupo").addEventListener("click", async () => {
    const nombre    = document.getElementById("nuevoGrupoNombre").value.trim();
    const categoria = document.getElementById("nuevoGrupoCategoria").value;
    const msg       = document.getElementById("msgGrupo");

    if (!nombre || !categoria) { alert("Completá nombre y categoría."); return; }

    await addDoc(collection(db, "grupos"), {
      nombre, categoria, createdAt: new Date()
    });

    msg.style.display = "block";
    msg.textContent = `✅ Grupo "${nombre}" creado.`;
    setTimeout(() => { msg.style.display = "none"; }, 3000);

    document.getElementById("nuevoGrupoNombre").value = "";
    document.getElementById("nuevoGrupoCategoria").value = "";

    cargarGrupos();
    popularSelectGrupos();
    popularSelectGruposFotosGrupales();
  });
}

async function cargarGrupos() {
  const container = document.getElementById("listaGrupos");
  container.innerHTML = "<p style='color:#555'>Cargando...</p>";

  const gruposSnap = await getDocs(collection(db, "grupos"));
  if (gruposSnap.empty) {
    container.innerHTML = "<p style='color:#555'>No hay grupos aún.</p>";
    return;
  }

  container.innerHTML = "";

  for (const gDoc of gruposSnap.docs) {
    const g = gDoc.data();

    // Contar clientes en este grupo
    const clientesSnap = await getDocs(query(
      collection(db, "usuarios"),
      where("role", "==", "cliente"),
      where("grupoId", "==", gDoc.id)
    ));

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="grupo-header" onclick="toggleGrupo('${gDoc.id}')">
        <div>
          <h4>📁 ${g.nombre}</h4>
          <div class="grupo-meta">${g.categoria} · ${clientesSnap.size} cliente(s)</div>
        </div>
        <button class="btn-danger" onclick="event.stopPropagation(); eliminarGrupo('${gDoc.id}','${g.nombre}')">Eliminar</button>
      </div>
      <div class="grupo-body" id="grupo-body-${gDoc.id}">
        <table style="margin-top:8px;">
          <thead><tr><th>Nombre</th><th>Email</th><th>Fotos</th></tr></thead>
          <tbody>
            ${clientesSnap.empty
              ? `<tr><td colspan="3" style="color:#555">Sin clientes en este grupo.</td></tr>`
              : clientesSnap.docs.map(d => `
                <tr>
                  <td>${d.data().nombre}</td>
                  <td style="color:#888">${d.data().email}</td>
                  <td>${d.data().fotosCount || 0}</td>
                </tr>`).join("")
            }
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(wrap);
  }
}

window.toggleGrupo = (id) => {
  const body = document.getElementById("grupo-body-" + id);
  if (body) body.classList.toggle("open");
};

window.eliminarGrupo = async (id, nombre) => {
  if (!confirm(`¿Eliminar el grupo "${nombre}"? Los clientes no se borran.`)) return;
  await setDoc(doc(db, "grupos", id), { eliminado: true }, { merge: true });
  cargarGrupos();
};

async function popularSelectGruposFotosGrupales() {
  const sel  = document.getElementById("grupoParaFotosGrupales");
  if (!sel) return;
  const snap = await getDocs(collection(db, "grupos"));
  sel.innerHTML = '<option value="">-- Seleccioná un grupo --</option>';
  snap.forEach(d => {
    if (d.data().eliminado) return;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().nombre;
    sel.appendChild(opt);
  });
}

async function popularSelectGrupos() {
  const selects = ["nuevoGrupo", "grupoAnalytics"];
  const snap = await getDocs(collection(db, "grupos"));

  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const firstOpt = id === "nuevoGrupo"
      ? '<option value="">-- Asignar a grupo (opcional) --</option>'
      : '<option value="">-- Todos los grupos --</option>';
    sel.innerHTML = firstOpt;
    snap.forEach(d => {
      if (d.data().eliminado) return;
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre;
      sel.appendChild(opt);
    });
  });
}

// ══════════════════════════════════════════════════════
// USUARIOS
// ══════════════════════════════════════════════════════
function setupCrearUsuario() {
  document.getElementById("btnCrearUsuario").addEventListener("click", async () => {
    const nombre    = document.getElementById("nuevoNombre").value.trim();
    const email     = document.getElementById("nuevoEmail").value.trim();
    const password  = document.getElementById("nuevaPassword").value;
    const categoria = document.getElementById("nuevaCategoria").value;
    const grupoId   = document.getElementById("nuevoGrupo").value;
    const msg       = document.getElementById("msgUsuario");
    const btn       = document.getElementById("btnCrearUsuario");

    if (!nombre || !email || !password || !categoria) {
      alert("Completá todos los campos obligatorios."); return;
    }

    btn.disabled = true;
    btn.textContent = "Creando...";

    try {
      const secondaryApp  = initializeApp(firebaseConfig, "secondary");
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);

      await setDoc(doc(db, "usuarios", cred.user.uid), {
        nombre, email, role: "cliente", categoria,
        grupoId: grupoId || null,
        fotosCount: 0, createdAt: new Date()
      });

      await deleteApp(secondaryApp);

      msg.style.display = "block";
      msg.textContent = `✅ Cliente "${nombre}" creado correctamente.`;
      setTimeout(() => { msg.style.display = "none"; }, 3000);

      cargarUsuarios();
      popularSelectClientes();

      document.getElementById("nuevoNombre").value = "";
      document.getElementById("nuevoEmail").value = "";
      document.getElementById("nuevaPassword").value = "";
      document.getElementById("nuevaCategoria").value = "";
      document.getElementById("nuevoGrupo").value = "";

    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Crear cliente";
    }
  });
}

async function cargarUsuarios(filtroGrupoId = "") {
  const tbody = document.getElementById("tablaUsuarios");
  tbody.innerHTML = "<tr><td colspan='6' style='color:#555'>Cargando...</td></tr>";

  const [usuariosSnap, gruposSnap] = await Promise.all([
    getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente"))),
    getDocs(collection(db, "grupos"))
  ]);

  const gruposMap = {};
  gruposSnap.forEach(d => { gruposMap[d.id] = d.data().nombre; });

  // Popular filtro de grupos
  const filtroSel = document.getElementById("filtroGrupoClientes");
  if (filtroSel && filtroSel.options.length <= 1) {
    gruposSnap.forEach(d => {
      if (d.data().eliminado) return;
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre;
      filtroSel.appendChild(opt);
    });
  }

  tbody.innerHTML = "";
  let count = 0;
  usuariosSnap.forEach(d => {
    const u = d.data();
    if (u.eliminado) return;
    // Aplicar filtro de grupo si está seleccionado
    if (filtroGrupoId && u.grupoId !== filtroGrupoId) return;
    count++;
    const grupoNombre = u.grupoId ? (gruposMap[u.grupoId] || "-") : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td style="color:#888">${u.email}</td>
      <td><span class="tag tag-cliente">${u.categoria || "-"}</span></td>
      <td style="color:#888;font-size:0.82rem">${grupoNombre}</td>
      <td>${u.fotosCount || 0}</td>
      <td style="display:flex;gap:8px;">
        <button class="btn-secondary" style="padding:6px 12px;font-size:0.75rem;" onclick="editarCliente('${d.id}')">✏️ Editar</button>
        <button class="btn-danger" onclick="eliminarUsuario('${d.id}','${u.nombre}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (count === 0) {
    tbody.innerHTML = "<tr><td colspan='6' style='color:#555'>No hay clientes en este grupo.</td></tr>";
  }

  popularSelectGrupos();
  popularSelectClientes();
}

window.eliminarUsuario = async (uid, nombre) => {
  if (!confirm(`¿Eliminar al cliente "${nombre}"?`)) return;
  await setDoc(doc(db, "usuarios", uid), { eliminado: true }, { merge: true });
  cargarUsuarios();
};

async function popularSelectClientes() {
  const selects = ["clienteParaSubir", "clienteParaGaleria", "clienteSelecciones"];
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente")));

  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccioná un cliente --</option>';
    snap.forEach(d => {
      if (d.data().eliminado) return;
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre + " (" + (d.data().categoria || "-") + ")";
      sel.appendChild(opt);
    });
  });
}

// ══════════════════════════════════════════════════════
// SUBIR FOTOS
// ══════════════════════════════════════════════════════
function setupSubirFotos() {
  popularSelectClientes();

  const zone  = document.getElementById("uploadZone");
  const input = document.getElementById("fileInput");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.style.borderColor = "#c9a84c"; });
  zone.addEventListener("dragleave", () => { zone.style.borderColor = "#333"; });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.style.borderColor = "#333";
    handleFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", () => handleFiles(input.files));
}

async function handleFiles(files) {
  const clienteId = document.getElementById("clienteParaSubir").value;
  if (!clienteId) { alert("Seleccioná un cliente primero."); return; }

  const statusEl = document.getElementById("uploadStatus");
  const total = files.length;
  let done = 0;

  statusEl.innerHTML = `
    <p style="margin-top:12px;color:#aaa">Subiendo ${total} foto(s)...</p>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progBar"></div></div>
  `;

  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `clientes/${clienteId}`);
    formData.append("quality", "40");
    formData.append("width", "1200");
    formData.append("crop", "limit");

    try {
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();

      if (data.secure_url) {
        const fotoId = data.public_id.replace(/\//g, "_");
        await setDoc(doc(db, "fotos", fotoId), {
          clienteId, url: data.secure_url, publicId: data.public_id,
          seleccionada: false, uploadedAt: new Date()
        });
        await updateDoc(doc(db, "usuarios", clienteId), { fotosCount: increment(1) });
      }
    } catch (err) {
      console.error("Error subiendo foto:", err);
    }

    done++;
    const bar = document.getElementById("progBar");
    if (bar) bar.style.width = Math.round((done / total) * 100) + "%";
  }

  statusEl.innerHTML += `<p style="color:#6fcf97;margin-top:8px;">✅ ${done} foto(s) subidas correctamente.</p>`;
  cargarUsuarios();
}

// ══════════════════════════════════════════════════════
// GALERÍA ADMIN
// ══════════════════════════════════════════════════════
function setupGaleriaAdmin() {
  // Filtrar al cambiar cliente
  document.getElementById("clienteParaGaleria").addEventListener("change", () => {
    // Si se selecciona cliente, limpiar grupo y viceversa
    document.getElementById("grupoParaGaleria").value = "";
    cargarGaleriaAdmin();
  });

  // Filtrar al cambiar grupo
  document.getElementById("grupoParaGaleria").addEventListener("change", async () => {
    document.getElementById("clienteParaGaleria").value = "";
    const grupoId = document.getElementById("grupoParaGaleria").value;
    if (!grupoId) { cargarGaleriaAdmin(); return; }

    // Obtener clientes del grupo y mostrar sus fotos
    const cSnap = await getDocs(query(
      collection(db, "usuarios"),
      where("grupoId", "==", grupoId),
      where("role", "==", "cliente")
    ));
    const clienteIds = cSnap.docs.map(d => d.id);
    cargarGaleriaAdmin(null, clienteIds);
  });
}

async function popularSelectClientesGaleria() {
  const sel  = document.getElementById("clienteParaGaleria");
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente")));
  sel.innerHTML = '<option value="">-- Todos los clientes --</option>';
  snap.forEach(d => {
    if (d.data().eliminado) return;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().nombre + " (" + (d.data().categoria || "-") + ")";
    sel.appendChild(opt);
  });
}

async function popularSelectGruposGaleria() {
  const sel  = document.getElementById("grupoParaGaleria");
  const snap = await getDocs(collection(db, "grupos"));
  sel.innerHTML = '<option value="">-- Todos los grupos --</option>';
  snap.forEach(d => {
    if (d.data().eliminado) return;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().nombre;
    sel.appendChild(opt);
  });
}

async function cargarGaleriaAdmin(clienteId = null, clienteIds = null) {
  const container = document.getElementById("galeriaAdmin");
  const empty     = document.getElementById("galeriaEmpty");
  const contador  = document.getElementById("galeriaContador");
  container.innerHTML = "<p style='color:#555'>Cargando...</p>";
  empty.style.display = "none";

  // Si no se pasó clienteId, tomarlo del select
  if (!clienteId) clienteId = document.getElementById("clienteParaGaleria").value;

  let snap;
  if (clienteId) {
    // Filtro por cliente específico
    snap = await getDocs(query(collection(db, "fotos"), where("clienteId", "==", clienteId)));
  } else if (clienteIds && clienteIds.length > 0) {
    // Filtro por grupo (múltiples clientes) — Firestore no soporta "in" con más de 10
    const chunks = [];
    for (let i = 0; i < clienteIds.length; i += 10) chunks.push(clienteIds.slice(i, i + 10));
    const docs = [];
    for (const chunk of chunks) {
      const s = await getDocs(query(collection(db, "fotos"), where("clienteId", "in", chunk)));
      s.forEach(d => docs.push(d));
    }
    snap = { docs, empty: docs.length === 0 };
  } else {
    // Mostrar todas
    snap = await getDocs(collection(db, "fotos"));
  }

  container.innerHTML = "";
  const fotos = snap.docs || (snap.forEach ? [] : []);
  if (snap.forEach) snap.forEach(d => fotos.push(d));

  if (fotos.length === 0) {
    empty.style.display = "block";
    contador.textContent = "";
    return;
  }

  contador.textContent = `${fotos.length} foto(s)`;
  fotos.forEach(d => {
    const foto = d.data();
    const div  = document.createElement("div");
    div.className = "gallery-item" + (foto.seleccionada ? " selected" : "");
    div.innerHTML = `<img src="${foto.url}" alt="foto" /><div class="check">✓</div>`;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════
// SELECCIONES (auto-carga al cambiar cliente)
// ══════════════════════════════════════════════════════
function setupSelecciones() {
  document.getElementById("clienteSelecciones").addEventListener("change", () => {
    verSelecciones();
  });
  document.getElementById("btnVerSelecciones").addEventListener("click", verSelecciones);
}

async function verSelecciones() {
  const clienteId = document.getElementById("clienteSelecciones").value;
  const container = document.getElementById("listaSelecciones");
  const msg       = document.getElementById("msgSelecciones");
  container.innerHTML = "";
  msg.style.display = "none";

  if (!clienteId) return;

  container.innerHTML = "<p style='color:#555'>Cargando...</p>";

  const snap = await getDocs(query(
    collection(db, "fotos"),
    where("clienteId", "==", clienteId),
    where("seleccionada", "==", true)
  ));

  container.innerHTML = "";
  if (snap.empty) { msg.style.display = "block"; return; }

  snap.forEach(d => {
    const foto = d.data();
    const div  = document.createElement("div");
    div.className = "gallery-item selected";
    div.innerHTML = `<img src="${foto.url}" alt="foto seleccionada" /><div class="check">✓</div>`;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════
function setupAnalytics() {
  document.getElementById("btnCargarAnalytics").addEventListener("click", cargarAnalytics);
}

async function cargarAnalytics() {
  // Stats globales
  const [clientesSnap, fotosSnap, gruposSnap] = await Promise.all([
    getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente"))),
    getDocs(collection(db, "fotos")),
    getDocs(collection(db, "grupos"))
  ]);

  let totalSeleccionadas = 0;
  fotosSnap.forEach(d => { if (d.data().seleccionada) totalSeleccionadas++; });

  document.getElementById("statClientes").textContent      = clientesSnap.size;
  document.getElementById("statFotos").textContent         = fotosSnap.size;
  document.getElementById("statSeleccionadas").textContent = totalSeleccionadas;
  document.getElementById("statGrupos").textContent        = gruposSnap.size;

  // Popular select de grupos
  const grupoSel = document.getElementById("grupoAnalytics");
  if (grupoSel.options.length <= 1) popularSelectGrupos();

  // Fotos más seleccionadas
  const grupoId   = document.getElementById("grupoAnalytics").value;
  const container = document.getElementById("analyticsGrid");
  const msgEl     = document.getElementById("msgAnalytics");
  container.innerHTML = "<p style='color:#555'>Calculando...</p>";
  msgEl.style.display = "none";

  // Obtener clientes del grupo (o todos)
  let clienteIds = [];
  if (grupoId) {
    const cSnap = await getDocs(query(collection(db, "usuarios"), where("grupoId", "==", grupoId), where("role", "==", "cliente")));
    cSnap.forEach(d => clienteIds.push(d.id));
  } else {
    clientesSnap.forEach(d => clienteIds.push(d.id));
  }

  if (clienteIds.length === 0) {
    container.innerHTML = "";
    msgEl.style.display = "block";
    return;
  }

  // Contar selecciones por foto
  const conteo = {}; // publicId → {url, count}
  for (const cId of clienteIds) {
    const fSnap = await getDocs(query(
      collection(db, "fotos"),
      where("clienteId", "==", cId),
      where("seleccionada", "==", true)
    ));
    fSnap.forEach(d => {
      const f = d.data();
      if (!conteo[d.id]) conteo[d.id] = { url: f.url, count: 0 };
      conteo[d.id].count++;
    });
  }

  const sorted = Object.values(conteo).sort((a, b) => b.count - a.count).slice(0, 20);

  if (sorted.length === 0) {
    container.innerHTML = "";
    msgEl.style.display = "block";
    return;
  }

  container.innerHTML = "";
  sorted.forEach(item => {
    const div = document.createElement("div");
    div.className = "analytics-card";
    div.innerHTML = `
      <img src="${item.url}" alt="foto" />
      <div class="ac-info">
        <div class="votes">${item.count}</div>
        <p>${item.count === 1 ? "1 cliente la eligió" : `${item.count} clientes la eligieron`}</p>
      </div>
    `;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════
// EDITAR CLIENTE
// ══════════════════════════════════════════════════════
window.editarCliente = async (uid) => {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return;
  const u = snap.data();

  // Populate modal
  document.getElementById("editUid").value          = uid;
  document.getElementById("editNombre").value       = u.nombre || "";
  document.getElementById("editEmail").value        = u.email  || "";
  document.getElementById("editCategoria").value    = u.categoria || "";
  document.getElementById("editAudiovisual").checked = !!u.servicioAudiovisual;

  // Populate grupo select
  const gruposSnap = await getDocs(collection(db, "grupos"));
  const sel = document.getElementById("editGrupo");
  sel.innerHTML = '<option value="">-- Sin grupo --</option>';
  gruposSnap.forEach(d => {
    if (d.data().eliminado) return;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().nombre;
    if (d.id === u.grupoId) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById("editModal").style.display = "flex";
};

window.cerrarEditModal = () => {
  document.getElementById("editModal").style.display = "none";
};

// Guardar edición
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("editForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const uid               = document.getElementById("editUid").value;
      const nombre            = document.getElementById("editNombre").value.trim();
      const categoria         = document.getElementById("editCategoria").value;
      const grupoId           = document.getElementById("editGrupo").value;
      const servicioAudiovisual = document.getElementById("editAudiovisual").checked;

      await updateDoc(doc(db, "usuarios", uid), {
        nombre, categoria, grupoId: grupoId || null, servicioAudiovisual
      });

      cerrarEditModal();
      cargarUsuarios();
    });
  }
});

// ══════════════════════════════════════════════════════
// FOTOS GRUPALES
// ══════════════════════════════════════════════════════
window.setupFotosGrupales = setupFotosGrupales;

function setupFotosGrupales() {
  const zone  = document.getElementById("uploadZoneGrupal");
  const input = document.getElementById("fileInputGrupal");
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.style.borderColor = "#c9a84c"; });
  zone.addEventListener("dragleave", () => { zone.style.borderColor = "#333"; });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.style.borderColor = "#333";
    handleFotosGrupales(e.dataTransfer.files);
  });
  input.addEventListener("change", () => handleFotosGrupales(input.files));

  document.getElementById("grupoParaFotosGrupales").addEventListener("change", cargarFotosGrupalesAdmin);
}

async function handleFotosGrupales(files) {
  const grupoId = document.getElementById("grupoParaFotosGrupales").value;
  if (!grupoId) { alert("Seleccioná un grupo primero."); return; }

  const statusEl = document.getElementById("uploadStatusGrupal");
  const total = files.length;
  let done = 0;

  statusEl.innerHTML = `
    <p style="margin-top:12px;color:#aaa">Subiendo ${total} foto(s) grupales...</p>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progBarGrupal"></div></div>
  `;

  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `grupos/${grupoId}`);
    formData.append("quality", "40");
    formData.append("width", "1200");
    formData.append("crop", "limit");

    try {
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();

      if (data.secure_url) {
        const fotoId = data.public_id.replace(/\//g, "_");
        await setDoc(doc(db, "fotosGrupales", fotoId), {
          grupoId, url: data.secure_url, publicId: data.public_id, uploadedAt: new Date()
        });
      }
    } catch (err) {
      console.error("Error subiendo foto grupal:", err);
    }

    done++;
    const bar = document.getElementById("progBarGrupal");
    if (bar) bar.style.width = Math.round((done / total) * 100) + "%";
  }

  statusEl.innerHTML += `<p style="color:#6fcf97;margin-top:8px;">✅ ${done} foto(s) grupales subidas.</p>`;
  cargarFotosGrupalesAdmin();
}

async function cargarFotosGrupalesAdmin() {
  const grupoId   = document.getElementById("grupoParaFotosGrupales").value;
  const container = document.getElementById("galeriaGrupal");
  if (!container) return;

  container.innerHTML = "<p style='color:#555'>Cargando...</p>";
  if (!grupoId) { container.innerHTML = ""; return; }

  const snap = await getDocs(query(collection(db, "fotosGrupales"), where("grupoId", "==", grupoId)));
  if (snap.empty) { container.innerHTML = "<p style='color:#555'>No hay fotos grupales aún.</p>"; return; }

  container.innerHTML = "";
  snap.forEach(d => {
    const foto = d.data();
    const div  = document.createElement("div");
    div.className = "gallery-item";
    div.style.position = "relative";
    div.innerHTML = `
      <img src="${foto.url}" alt="foto grupal" />
      <button onclick="eliminarFotoGrupal('${d.id}')" style="position:absolute;top:6px;right:6px;background:rgba(192,57,43,0.85);border:none;color:#fff;border-radius:4px;padding:4px 8px;font-size:0.75rem;cursor:pointer;">✕</button>
    `;
    container.appendChild(div);
  });
}

window.eliminarFotoGrupal = async (id) => {
  if (!confirm("¿Eliminar esta foto grupal?")) return;
  await setDoc(doc(db, "fotosGrupales", id), { eliminado: true }, { merge: true });
  cargarFotosGrupalesAdmin();
};

// ══════════════════════════════════════════════════════
// PROYECTOS AUDIOVISUALES
// ══════════════════════════════════════════════════════

// Inicializar cuando se entra a la tab
function initProyectos() {
  cargarProyectos();
  cargarDriveLinkAdmin();

  document.getElementById("btnGuardarDrive").addEventListener("click", async () => {
    const link = document.getElementById("driveLinkAdmin").value.trim();
    await setDoc(doc(db, "config", "general"), { driveLink: link }, { merge: true });
    const msg = document.getElementById("msgDrive");
    msg.style.display = "block";
    setTimeout(() => { msg.style.display = "none"; }, 2500);
  });
}

async function cargarDriveLinkAdmin() {
  const snap = await getDoc(doc(db, "config", "general"));
  if (snap.exists() && snap.data().driveLink) {
    document.getElementById("driveLinkAdmin").value = snap.data().driveLink;
  }
}

async function cargarProyectos() {
  const container = document.getElementById("listaProyectos");
  if (!container) return;
  container.innerHTML = "<p style='color:#555'>Cargando...</p>";

  const snap = await getDocs(collection(db, "proyectos"));
  if (snap.empty) {
    container.innerHTML = "<p style='color:#555'>No hay proyectos aún.</p>";
    return;
  }

  const estadoMap = {
    pendiente:  "⏳ Pendiente",
    recibido:   "📬 Recibido",
    en_edicion: "🎬 En edición",
    revision:   "👀 Para revisar",
    aprobado:   "✅ Aprobado"
  };

  container.innerHTML = "";
  snap.forEach(d => {
    const p   = d.data();
    const div = document.createElement("div");
    div.style.cssText = "background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:18px 20px;margin-bottom:12px;";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <p style="color:#fff;font-size:0.95rem;">${p.nombre || "Sin nombre"}</p>
          <p style="color:#666;font-size:0.8rem;margin-top:3px;">${p.archivos?.length || 0} archivo(s) subido(s)</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <select onchange="cambiarEstadoProyecto('${d.id}', this.value)" style="padding:7px 12px;background:#0d0d0d;border:1px solid #333;border-radius:4px;color:#fff;font-size:0.82rem;">
            ${Object.entries(estadoMap).map(([k,v]) =>
              `<option value="${k}" ${p.estado === k ? "selected" : ""}>${v}</option>`
            ).join("")}
          </select>
          <button class="btn-gold" style="padding:7px 14px;font-size:0.78rem;" onclick="verProyecto('${d.id}')">Ver detalles</button>
        </div>
      </div>
      ${p.formulario?.descripcion ? `<p style="color:#888;font-size:0.82rem;margin-top:10px;border-top:1px solid #222;padding-top:10px;">"${p.formulario.descripcion}"</p>` : ""}
    `;
    container.appendChild(div);
  });
}

window.cambiarEstadoProyecto = async (id, estado) => {
  await updateDoc(doc(db, "proyectos", id), { estado });
};

window.verProyecto = async (id) => {
  const snap = await getDoc(doc(db, "proyectos", id));
  if (!snap.exists()) return;
  const p = snap.data();

  const form = p.formulario || {};
  const campos = [
    ["Tipo de contenido", form.tipoContenido],
    ["Estilo",            form.estilo],
    ["Música",            form.musica],
    ["Duración",          form.duracion],
    ["Referencias",       form.referencias],
    ["Descripción",       form.descripcion],
  ].filter(([,v]) => v);

  let html = `<div style="background:#161616;border:1px solid #333;border-radius:8px;padding:28px;max-width:540px;width:100%;max-height:85vh;overflow-y:auto;">`;
  html += `<h3 style="color:#c9a84c;letter-spacing:2px;font-size:0.85rem;text-transform:uppercase;margin-bottom:16px;">Proyecto de ${p.nombre}</h3>`;

  if (campos.length) {
    html += `<div style="margin-bottom:16px;">`;
    campos.forEach(([label, val]) => {
      html += `<p style="margin-bottom:8px;"><span style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;">${label}:</span><br/><span style="color:#ddd;font-size:0.9rem;">${val}</span></p>`;
    });
    html += `</div>`;
  }

  if (p.archivos?.length) {
    html += `<p style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Archivos (${p.archivos.length})</p>`;
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">`;
    p.archivos.forEach(a => {
      html += a.tipo === "video"
        ? `<video src="${a.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;" controls></video>`
        : `<img src="${a.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;" />`;
    });
    html += `</div>`;
  }

  // Mensajes
  const comentarios = p.comentarios || [];
  html += `<p style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Mensajes (${comentarios.length})</p>`;
  if (comentarios.length) {
    comentarios.forEach(c => {
      html += `<p style="background:#0d0d0d;border-radius:4px;padding:8px 12px;margin-bottom:6px;font-size:0.85rem;color:#ccc;"><span style="color:#666;font-size:0.72rem;">${c.autor === "admin" ? "Vos" : p.nombre}:</span> ${c.texto}</p>`;
    });
  }

  // Responder
  html += `
    <div style="display:flex;gap:8px;margin-top:12px;">
      <input id="respuestaAdmin" type="text" placeholder="Escribí una respuesta..." style="flex:1;padding:9px 12px;background:#0d0d0d;border:1px solid #333;border-radius:4px;color:#fff;font-size:0.85rem;"/>
      <button onclick="enviarRespuestaAdmin('${id}')" style="padding:9px 16px;background:#c9a84c;border:none;border-radius:4px;color:#000;font-weight:700;cursor:pointer;font-size:0.82rem;">Enviar</button>
    </div>
    <button onclick="document.getElementById('proyectoModal').remove()" style="margin-top:16px;width:100%;padding:10px;background:transparent;border:1px solid #333;border-radius:4px;color:#888;cursor:pointer;font-size:0.82rem;letter-spacing:1px;text-transform:uppercase;">Cerrar</button>
  </div>`;

  const modal = document.createElement("div");
  modal.id = "proyectoModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;padding:20px;";
  modal.innerHTML = html;
  document.body.appendChild(modal);
};

window.enviarRespuestaAdmin = async (proyId) => {
  const input  = document.getElementById("respuestaAdmin");
  const texto  = input.value.trim();
  if (!texto) return;

  const snap = await getDoc(doc(db, "proyectos", proyId));
  const comentarios = snap.data().comentarios || [];
  comentarios.push({
    autor: "admin", texto,
    fecha: new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
  });
  await updateDoc(doc(db, "proyectos", proyId), { comentarios });
  input.value = "";
  document.getElementById("proyectoModal")?.remove();
  verProyecto(proyId);
};
