import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, getDocs, addDoc, updateDoc,
  collection, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let proyectoId  = null;

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists()) { window.location.href = "login.html"; return; }

  const data = snap.data();
  if (data.role === "admin") { window.location.href = "admin.html"; return; }
  if (!data.servicioAudiovisual) { window.location.href = "cliente.html"; return; }

  currentUser = { uid: user.uid, ...data };
  document.getElementById("clientName").textContent  = data.nombre || user.email;
  document.getElementById("clientEmail").textContent = user.email;

  await cargarOCrearProyecto();
});

window.logout = async () => {
  const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  await signOut(auth);
  window.location.href = "login.html";
};

// ── Cargar o crear proyecto ───────────────────────────────────
async function cargarOCrearProyecto() {
  const snap = await getDocs(query(
    collection(db, "proyectos"),
    where("clienteId", "==", currentUser.uid)
  ));

  if (snap.empty) {
    // Crear proyecto nuevo vacío
    const ref = await addDoc(collection(db, "proyectos"), {
      clienteId: currentUser.uid,
      nombre: currentUser.nombre,
      estado: "pendiente",
      formulario: {},
      archivos: [],
      comentarios: [],
      driveLink: "",
      createdAt: serverTimestamp()
    });
    proyectoId = ref.id;
  } else {
    proyectoId = snap.docs[0].id;
    const p = snap.docs[0].data();
    poblarFormulario(p.formulario || {});
    renderArchivos(p.archivos || []);
    renderEstado(p.estado || "pendiente");
    renderComentarios(p.comentarios || []);
  }

  await cargarDriveLink();
}

// ── Drive link ────────────────────────────────────────────────
async function cargarDriveLink() {
  const confSnap = await getDoc(doc(db, "config", "general"));
  const link = confSnap.exists() ? confSnap.data().driveLink : "";
  const el   = document.getElementById("driveLink");
  if (el && link) {
    el.href = link;
    document.getElementById("driveSection").style.display = "block";
  }
}

// ── Formulario de proyecto ────────────────────────────────────
function poblarFormulario(data) {
  const campos = ["tipoContenido","estilo","musica","duracion","referencias","descripcion"];
  campos.forEach(c => {
    const el = document.getElementById("f_" + c);
    if (el && data[c]) el.value = data[c];
  });
}

document.getElementById("proyectoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btnGuardarFormulario");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  const formulario = {
    tipoContenido: document.getElementById("f_tipoContenido").value,
    estilo:        document.getElementById("f_estilo").value,
    musica:        document.getElementById("f_musica").value,
    duracion:      document.getElementById("f_duracion").value,
    referencias:   document.getElementById("f_referencias").value,
    descripcion:   document.getElementById("f_descripcion").value,
  };

  await updateDoc(doc(db, "proyectos", proyectoId), { formulario, estado: "recibido" });

  btn.disabled = false;
  btn.textContent = "✅ Guardado";
  renderEstado("recibido");
  setTimeout(() => { btn.textContent = "Guardar ideas"; }, 2500);
});

// ── Subir archivos ────────────────────────────────────────────
const uploadZone  = document.getElementById("uploadZoneProyecto");
const fileInput   = document.getElementById("fileInputProyecto");
const statusEl    = document.getElementById("uploadStatusProyecto");

uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.style.borderColor = "#c9a84c"; });
uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = "#333"; });
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.style.borderColor = "#333";
  subirArchivos(e.dataTransfer.files);
});
fileInput.addEventListener("change", () => subirArchivos(fileInput.files));

async function subirArchivos(files) {
  const MAX_MB   = 100;
  const archivos = [];
  const rechazados = [];

  for (const file of files) {
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_MB) {
      rechazados.push(file.name);
      continue;
    }
    archivos.push(file);
  }

  if (rechazados.length > 0) {
    document.getElementById("driveSection").style.display = "block";
    document.getElementById("rejectedFiles").textContent =
      `⚠️ Estos archivos superan 100 MB y no se pueden subir acá: ${rechazados.join(", ")}. Subílos al Drive que aparece abajo.`;
  }

  if (archivos.length === 0) return;

  statusEl.innerHTML = `
    <p style="margin-top:12px;color:#aaa">Subiendo ${archivos.length} archivo(s)...</p>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progBarProyecto"></div></div>
  `;

  const nuevoArchivos = [];
  let done = 0;

  for (const file of archivos) {
    const isVideo = file.type.startsWith("video/");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `proyectos/${currentUser.uid}`);
    if (!isVideo) {
      formData.append("quality", "80"); // fotos en calidad mayor para edición
    }

    try {
      const resourceType = isVideo ? "video" : "image";
      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();

      if (data.secure_url) {
        nuevoArchivos.push({
          url:       data.secure_url,
          publicId:  data.public_id,
          nombre:    file.name,
          tipo:      isVideo ? "video" : "imagen",
          subidoAt:  new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Error subiendo:", err);
    }

    done++;
    const bar = document.getElementById("progBarProyecto");
    if (bar) bar.style.width = Math.round((done / archivos.length) * 100) + "%";
  }

  // Guardar en Firestore (merge con archivos existentes)
  const proySnap  = await getDoc(doc(db, "proyectos", proyectoId));
  const existentes = proySnap.data().archivos || [];
  const todos      = [...existentes, ...nuevoArchivos];

  await updateDoc(doc(db, "proyectos", proyectoId), { archivos: todos, estado: "recibido" });

  statusEl.innerHTML += `<p style="color:#6fcf97;margin-top:8px;">✅ ${done} archivo(s) subidos correctamente.</p>`;
  renderArchivos(todos);
  renderEstado("recibido");
}

// ── Render archivos subidos ───────────────────────────────────
function renderArchivos(archivos) {
  const container = document.getElementById("archivosSubidos");
  const empty     = document.getElementById("emptyArchivos");
  container.innerHTML = "";

  if (!archivos || archivos.length === 0) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  archivos.forEach((a, idx) => {
    const div = document.createElement("div");
    div.className = "archivo-item";
    const preview = a.tipo === "video"
      ? `<video src="${a.url}" style="width:100%;height:100%;object-fit:cover;" muted></video>`
      : `<img src="${a.url}" alt="${a.nombre}" style="width:100%;height:100%;object-fit:cover;" draggable="false"/>`;
    div.innerHTML = `
      ${preview}
      <div class="archivo-label">${a.tipo === "video" ? "🎬" : "📷"} ${a.nombre}</div>
    `;
    container.appendChild(div);
  });
}

// ── Render estado del proyecto ────────────────────────────────
function renderEstado(estado) {
  const map = {
    pendiente:  { label: "Pendiente de envío",   color: "#666",    bg: "#1a1a1a" },
    recibido:   { label: "Recibido ✓",            color: "#f2c94c", bg: "#2a2a1a" },
    en_edicion: { label: "En edición 🎬",         color: "#5ba3d9", bg: "#1a2a3a" },
    revision:   { label: "Listo para revisar 👀", color: "#c9a84c", bg: "#2a1f0a" },
    aprobado:   { label: "Aprobado ✅",            color: "#6fcf97", bg: "#1a3a1a" },
  };
  const s   = map[estado] || map.pendiente;
  const el  = document.getElementById("estadoProyecto");
  if (el) {
    el.textContent       = s.label;
    el.style.color       = s.color;
    el.style.background  = s.bg;
  }
}

// ── Comentarios ───────────────────────────────────────────────
function renderComentarios(comentarios) {
  const container = document.getElementById("listaComentarios");
  container.innerHTML = "";
  if (!comentarios || comentarios.length === 0) {
    container.innerHTML = "<p style='color:#555;font-size:0.85rem;'>Todavía no hay mensajes.</p>";
    return;
  }
  comentarios.forEach(c => {
    const div = document.createElement("div");
    div.className = "comentario-item " + (c.autor === "admin" ? "admin" : "cliente");
    div.innerHTML = `
      <span class="comentario-autor">${c.autor === "admin" ? "Omar (fotógrafo)" : currentUser.nombre}</span>
      <p>${c.texto}</p>
      <span class="comentario-fecha">${c.fecha || ""}</span>
    `;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

document.getElementById("btnEnviarComentario").addEventListener("click", async () => {
  const input = document.getElementById("inputComentario");
  const texto = input.value.trim();
  if (!texto) return;

  const proySnap   = await getDoc(doc(db, "proyectos", proyectoId));
  const comentarios = proySnap.data().comentarios || [];
  comentarios.push({
    autor:  "cliente",
    texto,
    fecha: new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
  });

  await updateDoc(doc(db, "proyectos", proyectoId), { comentarios });
  input.value = "";
  renderComentarios(comentarios);
});
