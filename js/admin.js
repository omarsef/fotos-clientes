import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_UPLOAD_PRESET } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, getDocs, collection,
  updateDoc, increment, query, where
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
    });
  });

  cargarUsuarios();
  setupCrearUsuario();
  setupSubirFotos();
  setupGaleriaAdmin();
  setupSelecciones();
}

// ── Crear usuario cliente ────────────────────────────────────
function setupCrearUsuario() {
  document.getElementById("btnCrearUsuario").addEventListener("click", async () => {
    const nombre    = document.getElementById("nuevoNombre").value.trim();
    const email     = document.getElementById("nuevoEmail").value.trim();
    const password  = document.getElementById("nuevaPassword").value;
    const categoria = document.getElementById("nuevaCategoria").value;
    const msg       = document.getElementById("msgUsuario");

    if (!nombre || !email || !password || !categoria) {
      alert("Completá todos los campos."); return;
    }

    try {
      // Save current admin session
      const adminUser = auth.currentUser;

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        nombre, email, role: "cliente", categoria, fotosCount: 0, createdAt: new Date()
      });

      // Sign back in as admin (the new user gets auto-signed in by Firebase)
      // We just reload the page to restore admin session - admin needs to re-login
      msg.style.display = "block";
      msg.textContent = `✅ Cliente "${nombre}" creado. (Nota: deberás volver a iniciar sesión como admin)`;
      cargarUsuarios();
      popularSelectClientes();

      // Clear fields
      document.getElementById("nuevoNombre").value = "";
      document.getElementById("nuevoEmail").value = "";
      document.getElementById("nuevaPassword").value = "";
      document.getElementById("nuevaCategoria").value = "";

    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

// ── Cargar tabla de usuarios ──────────────────────────────────
async function cargarUsuarios() {
  const tbody = document.getElementById("tablaUsuarios");
  tbody.innerHTML = "<tr><td colspan='5' style='color:#555'>Cargando...</td></tr>";

  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente")));
  if (snap.empty) {
    tbody.innerHTML = "<tr><td colspan='5' style='color:#555'>No hay clientes aún.</td></tr>";
    return;
  }

  tbody.innerHTML = "";
  snap.forEach(d => {
    const u = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td style="color:#888">${u.email}</td>
      <td><span class="tag tag-cliente">${u.categoria || "-"}</span></td>
      <td>${u.fotosCount || 0}</td>
      <td><button class="btn-danger" onclick="eliminarUsuario('${d.id}','${u.nombre}')">Eliminar</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.eliminarUsuario = async (uid, nombre) => {
  if (!confirm(`¿Eliminar al cliente "${nombre}"?`)) return;
  // Only remove Firestore record (Firebase Auth deletion requires Admin SDK)
  await setDoc(doc(db, "usuarios", uid), { eliminado: true }, { merge: true });
  cargarUsuarios();
};

// ── Popular selects de clientes ──────────────────────────────
async function popularSelectClientes() {
  const selects = ["clienteParaSubir", "clienteParaGaleria", "clienteSelecciones"];
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "cliente")));

  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccioná un cliente --</option>';
    snap.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre + " (" + d.data().categoria + ")";
      sel.appendChild(opt);
    });
  });
}

// ── Subir fotos a Cloudinary ──────────────────────────────────
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
    // Baja calidad + marca de agua via transformation en el upload preset
    formData.append("folder", `clientes/${clienteId}`);
    formData.append("quality", "40");
    formData.append("width", "1200");
    formData.append("crop", "limit");

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (data.secure_url) {
        // Save to Firestore
        const fotoId = data.public_id.replace(/\//g, "_");
        await setDoc(doc(db, "fotos", fotoId), {
          clienteId,
          url: data.secure_url,
          publicId: data.public_id,
          seleccionada: false,
          uploadedAt: new Date()
        });
        await updateDoc(doc(db, "usuarios", clienteId), { fotosCount: increment(1) });
      }
    } catch (err) {
      console.error("Error subiendo foto:", err);
    }

    done++;
    document.getElementById("progBar").style.width = Math.round((done / total) * 100) + "%";
  }

  statusEl.innerHTML += `<p style="color:#6fcf97; margin-top:8px;">✅ ${done} foto(s) subidas correctamente.</p>`;
  cargarUsuarios();
}

// ── Galería admin (ver fotos de un cliente) ──────────────────
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
      const div = document.createElement("div");
      div.className = "gallery-item";
      div.innerHTML = `<img src="${foto.url}" alt="foto" />
        <div class="check">✓</div>`;
      if (foto.seleccionada) div.classList.add("selected");
      container.appendChild(div);
    });
  });
}

// ── Ver selecciones del cliente ──────────────────────────────
function setupSelecciones() {
  document.getElementById("btnVerSelecciones").addEventListener("click", async () => {
    const clienteId = document.getElementById("clienteSelecciones").value;
    if (!clienteId) { alert("Seleccioná un cliente."); return; }

    const container = document.getElementById("listaSelecciones");
    const msg       = document.getElementById("msgSelecciones");
    container.innerHTML = "";
    msg.style.display = "none";

    const snap = await getDocs(query(
      collection(db, "fotos"),
      where("clienteId", "==", clienteId),
      where("seleccionada", "==", true)
    ));

    if (snap.empty) { msg.style.display = "block"; return; }

    snap.forEach(d => {
      const foto = d.data();
      const div = document.createElement("div");
      div.className = "gallery-item selected";
      div.innerHTML = `<img src="${foto.url}" alt="foto seleccionada" /><div class="check">✓</div>`;
      container.appendChild(div);
    });
  });
}
