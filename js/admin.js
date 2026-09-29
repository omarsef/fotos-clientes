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

async function cargarUsuarios() {
  const tbody = document.getElementById("tablaUsuarios");
  tbody.innerHTML = "<tr><td colspan='6' style='color:#555'>Cargando...</td></tr>";

  const [usuariosSnap, gruposSnap] = await Promise.all([
    getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente"))),
    getDocs(collection(db, "grupos"))
  ]);

  const gruposMap = {};
  gruposSnap.forEach(d => { gruposMap[d.id] = d.data().nombre; });

  if (usuariosSnap.empty) {
    tbody.innerHTML = "<tr><td colspan='6' style='color:#555'>No hay clientes aún.</td></tr>";
    return;
  }

  tbody.innerHTML = "";
  usuariosSnap.forEach(d => {
    const u = d.data();
    if (u.eliminado) return;
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
  document.getElementById("btnVerGaleria").addEventListener("click", async () => {
    const clienteId = document.getElementById("clienteParaGaleria").value;
    if (!clienteId) { alert("Seleccioná un cliente."); return; }

    const container = document.getElementById("galeriaAdmin");
    container.innerHTML = "<p style='color:#555'>Cargando...</p>";

    const snap = await getDocs(query(collection(db, "fotos"), where("clienteId", "==", clienteId)));
    if (snap.empty) { container.innerHTML = "<p style='color:#555'>No hay fotos para este cliente.</p>"; return; }

    container.innerHTML = "";
    snap.forEach(d => {
      const foto = d.data();
      const div  = document.createElement("div");
      div.className = "gallery-item" + (foto.seleccionada ? " selected" : "");
      div.innerHTML = `<img src="${foto.url}" alt="foto" /><div class="check">✓</div>`;
      container.appendChild(div);
    });
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
  document.getElementById("editUid").value       = uid;
  document.getElementById("editNombre").value    = u.nombre || "";
  document.getElementById("editEmail").value     = u.email  || "";
  document.getElementById("editCategoria").value = u.categoria || "";

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
      const uid      = document.getElementById("editUid").value;
      const nombre   = document.getElementById("editNombre").value.trim();
      const categoria= document.getElementById("editCategoria").value;
      const grupoId  = document.getElementById("editGrupo").value;

      await updateDoc(doc(db, "usuarios", uid), {
        nombre, categoria, grupoId: grupoId || null
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
