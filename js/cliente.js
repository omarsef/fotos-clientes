import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser   = null;
let fotos         = [];
let seleccionadas = new Set();
let lightboxIdx   = -1;

// ── Bloquear clic derecho y arrastre en TODO el sitio ─────────
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists()) { window.location.href = "login.html"; return; }

  const data = snap.data();
  if (data.role === "admin") { window.location.href = "admin.html"; return; }

  currentUser = { uid: user.uid, ...data };
  document.getElementById("clientEmail").textContent = user.email;
  document.getElementById("clientName").textContent  = data.nombre || user.email;

  cargarFotos();
  cargarFotosGrupales();
  setupCompartirContenidos();

  // Mostrar banner audiovisual si el admin activó el servicio
  if (data.servicioAudiovisual) {
    const banner = document.getElementById("bannerAudiovisual");
    if (banner) banner.style.display = "block";
  }
});

window.logout = async () => { await signOut(auth); window.location.href = "login.html"; };

// ── Cargar fotos grupales ────────────────────────────────────
async function cargarFotosGrupales() {
  if (!currentUser.grupoId) return;

  const container = document.getElementById("galeriaGrupal");
  const section   = document.getElementById("seccionGrupal");
  if (!container || !section) return;

  const snap = await getDocs(query(
    collection(db, "fotosGrupales"),
    where("grupoId", "==", currentUser.grupoId)
  ));

  if (snap.empty) return;

  section.style.display = "block";
  snap.forEach((d, idx) => {
    const foto = d.data();
    if (foto.eliminado) return;
    const div = document.createElement("div");
    div.className = "gallery-item";
    div.innerHTML = `<img src="${foto.url}" alt="foto grupal" loading="lazy" draggable="false" /><div class="zoom-hint">🔍</div>`;
    div.addEventListener("dblclick", () => abrirLightboxGrupal(d.id, snap));
    div.querySelector(".zoom-hint").addEventListener("click", () => abrirLightboxGrupal(d.id, snap));
    container.appendChild(div);
  });
}

function abrirLightboxGrupal(fotoId, snap) {
  const fotos = [];
  snap.forEach(d => { if (!d.data().eliminado) fotos.push({ id: d.id, ...d.data() }); });
  const idx = fotos.findIndex(f => f.id === fotoId);
  if (idx < 0) return;

  const foto = fotos[idx];
  const img  = document.getElementById("lightboxImg");
  img.src = foto.url;
  img.draggable = false;
  document.getElementById("lightbox").classList.add("open");
  document.getElementById("lightboxCounter").textContent = `${idx + 1} / ${fotos.length}`;
  document.getElementById("lightboxSelect").style.display = "none";

  document.getElementById("lightboxPrev").onclick = () => {
    const ni = idx - 1;
    if (ni >= 0) abrirLightboxGrupal(fotos[ni].id, snap);
  };
  document.getElementById("lightboxNext").onclick = () => {
    const ni = idx + 1;
    if (ni < fotos.length) abrirLightboxGrupal(fotos[ni].id, snap);
  };

  document.onkeydown = (e) => {
    if (e.key === "ArrowRight" && idx + 1 < fotos.length) abrirLightboxGrupal(fotos[idx+1].id, snap);
    if (e.key === "ArrowLeft"  && idx - 1 >= 0)           abrirLightboxGrupal(fotos[idx-1].id, snap);
    if (e.key === "Escape") cerrarLightbox();
  };
}

// ── Cargar fotos personales ──────────────────────────────────
async function cargarFotos() {
  const container = document.getElementById("galeriaCliente");
  const empty     = document.getElementById("emptyState");

  const snap = await getDocs(query(
    collection(db, "fotos"),
    where("clienteId", "==", currentUser.uid)
  ));

  if (snap.empty) {
    container.style.display = "none";
    empty.style.display = "block";
    return;
  }

  fotos = [];
  snap.forEach(d => {
    fotos.push({ id: d.id, ...d.data() });
    if (d.data().seleccionada) seleccionadas.add(d.id);
  });

  renderGaleria();
  actualizarContador();
}

// ── Render fotos ─────────────────────────────────────────────
function renderGaleria() {
  const container = document.getElementById("galeriaCliente");
  container.innerHTML = "";

  fotos.forEach((foto, idx) => {
    const div = document.createElement("div");
    div.className = "gallery-item" + (seleccionadas.has(foto.id) ? " selected" : "");
    div.innerHTML = `
      <img src="${foto.url}" alt="foto ${idx + 1}" loading="lazy" draggable="false" />
      <div class="check">✓</div>
      <div class="zoom-hint">🔍</div>
    `;

    // Clic simple = seleccionar/deseleccionar
    div.addEventListener("click", (e) => {
      // Si el clic fue en el ícono de zoom, abrir lightbox
      if (e.target.classList.contains("zoom-hint")) {
        abrirLightbox(idx);
        return;
      }
      toggleSeleccion(foto.id);
    });

    // Doble clic = lightbox
    div.addEventListener("dblclick", () => abrirLightbox(idx));

    container.appendChild(div);
  });
}

// ── Toggle selección ─────────────────────────────────────────
function toggleSeleccion(fotoId) {
  if (seleccionadas.has(fotoId)) {
    seleccionadas.delete(fotoId);
  } else {
    seleccionadas.add(fotoId);
  }
  renderGaleria();
  actualizarContador();
}

function actualizarContador() {
  const count = seleccionadas.size;
  document.getElementById("countSelected").textContent = count;
  document.getElementById("btnConfirm").disabled = count === 0;
}

// ── Confirmar selección ──────────────────────────────────────
document.getElementById("btnConfirm").addEventListener("click", async () => {
  if (!confirm(`¿Confirmás la selección de ${seleccionadas.size} foto(s)?`)) return;

  const btn = document.getElementById("btnConfirm");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    for (const foto of fotos) {
      await updateDoc(doc(db, "fotos", foto.id), {
        seleccionada: seleccionadas.has(foto.id)
      });
    }
    showToast("✅ Selección confirmada. ¡Gracias!");
    btn.textContent = "✅ Selección guardada";
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Confirmar selección";
    showToast("Error al guardar. Intentá de nuevo.");
  }
});

// ── Lightbox ─────────────────────────────────────────────────
function abrirLightbox(idx) {
  lightboxIdx = idx;
  const foto = fotos[idx];
  const img  = document.getElementById("lightboxImg");
  img.src = foto.url;
  img.draggable = false;
  document.getElementById("lightbox").classList.add("open");
  document.getElementById("lightboxCounter").textContent = `${idx + 1} / ${fotos.length}`;

  // Restaurar botón seleccionar (puede estar oculto si se abrió desde grupales)
  const btnSel = document.getElementById("lightboxSelect");
  btnSel.style.display = "";
  actualizarBtnLightbox(btnSel, foto.id);
  btnSel.onclick = () => {
    toggleSeleccion(foto.id);
    actualizarBtnLightbox(btnSel, foto.id);
  };

  // Navegación con flechas del teclado
  document.onkeydown = (e) => {
    if (e.key === "ArrowRight") navegarLightbox(1);
    if (e.key === "ArrowLeft")  navegarLightbox(-1);
    if (e.key === "Escape")     cerrarLightbox();
  };
}

function actualizarBtnLightbox(btn, fotoId) {
  btn.textContent = seleccionadas.has(fotoId) ? "✓ Seleccionada" : "Seleccionar esta foto";
  btn.style.background = seleccionadas.has(fotoId) ? "#4caf50" : "#c9a84c";
}

function navegarLightbox(dir) {
  const nuevoIdx = lightboxIdx + dir;
  if (nuevoIdx >= 0 && nuevoIdx < fotos.length) abrirLightbox(nuevoIdx);
}

function cerrarLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.onkeydown = null;
}

document.getElementById("lightboxClose").addEventListener("click", cerrarLightbox);
document.getElementById("lightbox").addEventListener("click", (e) => {
  if (e.target === document.getElementById("lightbox")) cerrarLightbox();
});

// Botones de navegación en el lightbox
document.getElementById("lightboxPrev").addEventListener("click", () => navegarLightbox(-1));
document.getElementById("lightboxNext").addEventListener("click", () => navegarLightbox(1));

// ── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

// ── Sección "Compartí tus contenidos" ────────────────────────
async function setupCompartirContenidos() {
  // Cargar drive link
  const confSnap = await getDoc(doc(db, "config", "general"));
  if (confSnap.exists() && confSnap.data().driveLink) {
    const linkEl = document.getElementById("driveLinkCliente");
    if (linkEl) {
      linkEl.href = confSnap.data().driveLink;
      document.getElementById("driveSectionCliente").style.display = "block";
    }
  }

  // Cargar archivos ya subidos
  await cargarArchivosCliente();

  const zone  = document.getElementById("uploadClienteZone");
  const input = document.getElementById("fileInputCliente");
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.style.borderColor = "#c9a84c"; });
  zone.addEventListener("dragleave", () => { zone.style.borderColor = "#333"; });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.style.borderColor = "#333";
    subirArchivosCliente(e.dataTransfer.files);
  });
  input.addEventListener("change", () => subirArchivosCliente(input.files));
}

async function subirArchivosCliente(files) {
  const MAX_MB     = 100;
  const validos    = [];
  const rechazados = [];

  for (const file of files) {
    if (file.size / (1024 * 1024) > MAX_MB) rechazados.push(file.name);
    else validos.push(file);
  }

  const rejEl = document.getElementById("rejectedCliente");
  if (rechazados.length > 0 && rejEl) {
    rejEl.style.display = "block";
    rejEl.textContent   = `⚠️ Archivos muy pesados (usar Drive): ${rechazados.join(", ")}`;
    document.getElementById("driveSectionCliente").style.display = "block";
  }

  if (validos.length === 0) return;

  const statusEl = document.getElementById("uploadStatusCliente");
  statusEl.innerHTML = `
    <p style="margin-top:8px;color:#aaa">Subiendo ${validos.length} archivo(s)...</p>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progBarCliente"></div></div>
  `;

  let done = 0;
  const nuevos = [];

  for (const file of validos) {
    const isVideo  = file.type.startsWith("video/");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `contenidos-clientes/${currentUser.uid}`);
    if (!isVideo) formData.append("quality", "80");

    try {
      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${isVideo ? "video" : "image"}/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (data.secure_url) {
        nuevos.push({ url: data.secure_url, publicId: data.public_id, nombre: file.name, tipo: isVideo ? "video" : "imagen", subidoAt: new Date().toISOString() });
      }
    } catch (err) { console.error(err); }

    done++;
    const bar = document.getElementById("progBarCliente");
    if (bar) bar.style.width = Math.round((done / validos.length) * 100) + "%";
  }

  // Guardar en Firestore bajo contenidosClientes/{uid}
  const ref      = doc(db, "contenidosClientes", currentUser.uid);
  const existing = (await getDoc(ref)).data()?.archivos || [];
  await setDoc(ref, { clienteId: currentUser.uid, nombre: currentUser.nombre, archivos: [...existing, ...nuevos] }, { merge: true });

  statusEl.innerHTML += `<p style="color:#6fcf97;margin-top:6px;">✅ ${done} archivo(s) subidos.</p>`;
  cargarArchivosCliente();
}

async function cargarArchivosCliente() {
  const grid = document.getElementById("archivosClienteGrid");
  if (!grid) return;
  const snap = await getDoc(doc(db, "contenidosClientes", currentUser.uid));
  if (!snap.exists() || !snap.data().archivos?.length) return;

  grid.innerHTML = "";
  snap.data().archivos.forEach(a => {
    const div = document.createElement("div");
    div.style.cssText = "position:relative;background:#1a1a1a;border:1px solid #222;border-radius:6px;overflow:hidden;aspect-ratio:4/3;";
    div.innerHTML = a.tipo === "video"
      ? `<video src="${a.url}" style="width:100%;height:100%;object-fit:cover;" muted></video>`
      : `<img src="${a.url}" style="width:100%;height:100%;object-fit:cover;" draggable="false"/>`;
    div.innerHTML += `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);font-size:0.68rem;color:#ccc;padding:3px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.tipo === "video" ? "🎬" : "📷"} ${a.nombre}</div>`;
    grid.appendChild(div);
  });
}
