import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, updateDoc, collection, query, where
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
