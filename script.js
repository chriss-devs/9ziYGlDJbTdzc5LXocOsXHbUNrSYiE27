const firebaseConfig = {
  apiKey: "AIzaSyABLbx-ho0-Mjv09AArMjMQtD6xfzATLKs",
  authDomain: "isys-prom-2026.firebaseapp.com",
  databaseURL: "https://isys-prom-2026-default-rtdb.firebaseio.com",
  projectId: "isys-prom-2026",
  storageBucket: "isys-prom-2026.firebasestorage.app",
  messagingSenderId: "1097595649416",
  appId: "1:1097595649416:web:3508b011fa0baed7784e3d",
  measurementId: "G-BMXB2V2T1S",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let products = {};
let sales = [];
let editingId = null;
let deletingId = null;
let revertingId = null;
let barChart = null;
let doughnutChart = null;
let currentFilter = null;
let currentUserRole = "vendor";
let appLogs = [];
let appUsers = [];
let currentCart = {};
let posCategoryFilter = "all";
let registerSession = null;
let activeDeambulantes = {};
let deambulanteHistory = [];

function showToast(msg, type = "success") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = "slideOut .4s ease forwards";
    setTimeout(() => t.remove(), 400);
  }, 2000);
}

function logAction(action, detail) {
  const user = auth.currentUser ? auth.currentUser.email || "Admin" : "Sistema";
  db.ref("logs").push({
    action,
    detail,
    user,
    timestamp: Date.now(),
  });
}

function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  if (!email || !pass) return showToast("Completa todos los campos", "error");

  const btn = document.getElementById("btnLogin");
  btn.textContent = "Ingresando...";
  btn.disabled = true;

  auth
    .signInWithEmailAndPassword(email, pass)
    .then(() => showToast("Bienvenido"))
    .catch((e) => {
      showToast("Usuario o contraseña incorrectos", "error");
    })
    .finally(() => {
      btn.textContent = "INICIAR SESIÓN";
      btn.disabled = false;
    });
}

function doLogout() {
  auth.signOut().then(() => {
    currentUserRole = "vendor";
    showToast("Sesión cerrada", "info");
  });
}

function applyRoleRestrictions(role) {
  currentUserRole = role;
  const navInventory = document.getElementById("navInventory");
  const navStats = document.getElementById("navStats");
  const roleLabel = document.getElementById("sidebarRole");
  const navUsers = document.getElementById("navUsers");
  const navLogs = document.getElementById("navLogs");
  const navDebug = document.getElementById("navDebug");
  const navDeambulantes = document.getElementById("navDeambulantes");
  const btnToggleRegister = document.getElementById("btnToggleRegister");

  if (role === "admin") {
    if (navInventory) navInventory.classList.remove("hidden");
    if (navStats) navStats.classList.remove("hidden");
    if (navUsers) navUsers.classList.remove("hidden");
    if (navLogs) navLogs.classList.remove("hidden");
    if (navDebug) navDebug.classList.remove("hidden");
    if (navDeambulantes) navDeambulantes.classList.remove("hidden");
    if (roleLabel) roleLabel.textContent = "Administrador";
    if (btnToggleRegister) btnToggleRegister.style.display = "block";
  } else {
    if (navInventory) navInventory.classList.add("hidden");
    if (navStats) navStats.classList.add("hidden");
    if (navUsers) navUsers.classList.add("hidden");
    if (navLogs) navLogs.classList.add("hidden");
    if (navDebug) navDebug.classList.add("hidden");
    if (navDeambulantes) navDeambulantes.classList.add("hidden");
    if (roleLabel) roleLabel.textContent = "Vendedor";
    if (btnToggleRegister) btnToggleRegister.style.display = "none";

    const activeSection = document.querySelector(".section.active");
    if (activeSection && activeSection.id !== "sec-pos") {
      switchSection("pos");
    }
  }
}

auth.onAuthStateChanged((user) => {
  document.getElementById("loginScreen").style.display = user ? "none" : "flex";
  document.getElementById("appScreen").style.display = user ? "block" : "none";

  if (user) {
    db.ref("users/" + user.uid + "/role").once("value", (snap) => {
      const role = snap.val() || "vendor";
      if (role === "disabled") {
        auth.signOut();
        showToast("Cuenta suspendida por un administrador", "error");
        return;
      }
      applyRoleRestrictions(role);
    });

    initListeners();
    checkActiveRegister();
    db.ref("deambulantes/active").off();
    db.ref("deambulantes/history").off();
    initDeambulantesListeners();
  }
});

function initListeners() {
  db.ref("products").on("value", (snap) => {
    products = snap.val() || {};
    renderPOS();
    renderInventory();
    updateStats();
  });

  db.ref("sales").on("value", (snap) => {
    const data = snap.val() || {};
    sales = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
    sales.sort((a, b) => b.timestamp - a.timestamp);
    updateStats();
  });

  db.ref("logs").on("value", (snap) => {
    const data = snap.val() || {};
    appLogs = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
    appLogs.sort((a, b) => b.timestamp - a.timestamp);
    renderLogs();
  });

  db.ref("users").on("value", (snap) => {
    const data = snap.val() || {};
    appUsers = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
    renderUsers();
  });
}

function switchSection(id) {
  if (
    currentUserRole === "vendor" &&
    (id === "inventory" ||
      id === "stats" ||
      id === "logs" ||
      id === "users" ||
      id === "debug" ||
      id === "deambulantes")
  ) {
    showToast("No tienes acceso a esta sección", "error");
    return;
  }

  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("sec-" + id).classList.add("active");
  document
    .querySelectorAll(".nav-link")
    .forEach((n) => n.classList.toggle("active", n.dataset.section === id));

  if (id === "stats") setTimeout(() => renderCharts(), 200);
  if (window.innerWidth <= 768) toggleSidebar();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("open");
}

function renderPOS() {
  const grid = document.getElementById("posGrid");
  if (!grid) return;
  const searchTerm = (
    document.getElementById("posSearch")?.value || ""
  ).toLowerCase();
  grid.innerHTML = "";

  let displayedCount = 0;
  Object.entries(products).forEach(([id, p]) => {
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return;

    displayedCount++;
    const cartQty = currentCart[id] ? currentCart[id].qty : 0;
    const availableStock = p.stock - cartQty;

    const outOfStock = availableStock <= 0;
    const lowStock = availableStock > 0 && availableStock <= 5;

    let stockLabel = outOfStock
      ? "Agotado"
      : availableStock === 1
        ? "Queda 1"
        : "Stock: " + availableStock;

    grid.innerHTML += `
      <div class="product-card list-item">
        <div class="card-info">
          <div class="p-name">${p.name}</div>
          <div class="p-price">$${Number(p.price).toFixed(2)}</div>
          <div class="p-stock ${lowStock ? "low" : ""}">${stockLabel}</div>
        </div>
        <div class="card-actions">
          <button class="btn-sell" data-product-id="${id}" ${outOfStock ? "disabled" : ""}>
            ${outOfStock ? "AGOTADO" : "VENDER"}
          </button>
        </div>
      </div>`;
  });

  if (displayedCount === 0) {
    grid.innerHTML =
      '<div style="color:var(--text-dim); text-align:center; padding: 40px; width: 100%;">No hay productos</div>';
  }

  document.querySelectorAll(".btn-sell[data-product-id]").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(btn.dataset.productId));
  });
}

function addToCart(id) {
  const p = products[id];
  const currentQty = currentCart[id] ? currentCart[id].qty : 0;

  if (!p || p.stock - currentQty <= 0)
    return showToast("Stock insuficiente", "error");

  if (!currentCart[id]) {
    currentCart[id] = { name: p.name, price: p.price, qty: 1 };
  } else {
    currentCart[id].qty++;
  }

  showToast(`Guardado en carrito: ${p.name}`);
  updateCartUI();
  renderPOS();
}

function updateCartUI() {
  const panel = document.getElementById("cartPanel");
  const itemsCont = document.getElementById("cartItems");
  const totalDisp = document.getElementById("cartTotalDisplay");
  const btnCheckout = document.getElementById("btnCheckout");

  if (!panel) return;

  let total = 0;
  itemsCont.innerHTML = "";

  const entries = Object.entries(currentCart);
  if (entries.length === 0) {
    panel.classList.add("hidden");
    btnCheckout.disabled = true;
    totalDisp.textContent = "$0.00";
  } else {
    panel.classList.remove("hidden");
    btnCheckout.disabled = false;

    entries.forEach(([id, item]) => {
      const lineTotal = item.qty * item.price;
      total += lineTotal;
      itemsCont.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name} <span style="font-size:0.8rem; color:var(--text-dim);">x${item.qty}</span></div>
                        <div class="cart-item-price">$${lineTotal.toFixed(2)}</div>
                    </div>
                    <div class="cart-item-actions">
                        <button class="cart-btn" onclick="modifyCartQty('${id}', -1)">-</button>
                    </div>
                </div>
            `;
    });
    totalDisp.textContent = "$" + total.toFixed(2);
  }
}

function modifyCartQty(id, delta) {
  if (!currentCart[id]) return;
  const newQty = currentCart[id].qty + delta;
  if (newQty <= 0) {
    delete currentCart[id];
  } else {
    currentCart[id].qty = newQty;
  }
  updateCartUI();
  renderPOS();
}

function clearCart() {
  currentCart = {};
  updateCartUI();
  renderPOS();
}

function openCheckout() {
  const total = Object.values(currentCart).reduce(
    (acc, i) => acc + i.price * i.qty,
    0,
  );
  if (total <= 0) return;

  if (!registerSession) {
    return showToast("Debes abrir la caja antes de cobrar", "error");
  }

  document.getElementById("chkTotalAmt").textContent = "$" + total.toFixed(2);
  document.getElementById("chkReceivedAmt").value = "";
  document.getElementById("chkChangeBox").classList.add("hidden");
  document.getElementById("chkChangeAmt").textContent = "$0.00";
  document.getElementById("chkConfirm").disabled = true;

  document.getElementById("checkoutModal").classList.add("show");

  setTimeout(() => {
    document.getElementById("chkReceivedAmt").focus();
  }, 100);
}

function calculateChange() {
  const total = Object.values(currentCart).reduce(
    (acc, i) => acc + i.price * i.qty,
    0,
  );
  const recv = parseFloat(document.getElementById("chkReceivedAmt").value || 0);
  const btn = document.getElementById("chkConfirm");
  const changeBox = document.getElementById("chkChangeBox");

  if (recv >= total) {
    changeBox.classList.remove("hidden");
    document.getElementById("chkChangeAmt").textContent =
      "$" + (recv - total).toFixed(2);
    btn.disabled = false;
  } else {
    changeBox.classList.add("hidden");
    btn.disabled = true;
  }
}

function completeCheckout() {
  const btn = document.getElementById("chkConfirm");
  btn.disabled = true;
  btn.textContent = "Procesando...";

  const itemsToCharge = Object.entries(currentCart).map(([id, item]) => ({
    id,
    ...item,
  }));
  const total = itemsToCharge.reduce((acc, i) => acc + i.price * i.qty, 0);

  const recv =
    parseFloat(document.getElementById("chkReceivedAmt").value) || total;
  const change = recv - total;

  const promises = itemsToCharge.map((item) => {
    return db
      .ref("products/" + item.id)
      .transaction((product) => {
        if (product) {
          if (product.stock >= item.qty) {
            product.stock -= item.qty;
            product.sold = (product.sold || 0) + item.qty;
            return product;
          } else {
            return;
          }
        }
        return product;
      })
      .then((result) => {
        if (!result.committed) {
          throw new Error(
            `Stock insuficiente o producto eliminado: ${item.name}`,
          );
        }
        return item;
      });
  });

  Promise.all(promises)
    .then(() => {
      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().split("T")[0];
      const currentUser = auth.currentUser
        ? auth.currentUser.email || "Admin"
        : "Sistema";

      itemsToCharge.forEach((item) => {
        for (let i = 0; i < item.qty; i++) {
          db.ref("sales").push({
            productId: item.id,
            productName: item.name,
            price: item.price,
            emoji: item.emoji || "--",
            timestamp: timestamp,
            date: dateStr,
            user: currentUser,
            cashReceived: recv,
            change: change,
          });
        }
      });

      if (registerSession) {
        db.ref("cash_sessions/active/salesCash").transaction(
          (cash) => (cash || 0) + total,
        );
      }

      const itemsJson = encodeURIComponent(JSON.stringify(itemsToCharge));
      const alertHtml = `<span style="color:var(--blue); cursor:pointer; text-decoration:underline;" onclick="showLogDetails('${itemsJson}')">(${itemsToCharge.reduce((a, b) => a + b.qty, 0)} ítems)</span>`;

      logAction(
        "Venta",
        `Cobró venta múltiple por $${total.toFixed(2)} ${alertHtml}`,
      );

      showToast("Venta completada", "success");
      clearCart();
      closeCheckoutModal();
    })
    .catch((err) => {
      showToast(err.message, "error");
      console.error(err);
    })
    .finally(() => {
      btn.textContent = "Completar Venta";
    });
}

function closeCheckoutModal() {
  document.getElementById("checkoutModal").classList.remove("show");
}

function showLogDetails(encodedStr) {
  try {
    const items = JSON.parse(decodeURIComponent(encodedStr));
    const content = document.getElementById("logDetailsContent");
    if (!content) return;
    content.innerHTML =
      '<ul style="list-style:none; padding:0; margin:0;">' +
      items
        .map(
          (i) =>
            `<li style="padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;"><span><strong>${i.qty}x</strong> ${i.name}</span><span style="color:var(--accent-light); font-weight:600;">$${(i.price * i.qty).toFixed(2)}</span></li>`,
        )
        .join("") +
      "</ul>";
    document.getElementById("logDetailsModal").classList.add("show");
  } catch (e) {
    console.error("Error mostrando detalles", e);
  }
}

function showDeamDetails(encodedStr) {
  try {
    const data = JSON.parse(decodeURIComponent(encodedStr));
    const content = document.getElementById("logDetailsContent");
    if (!content) return;
    let html = "";
    if (data.itemsSold && data.itemsSold.length > 0) {
      html +=
        '<div style="font-weight:600; margin-bottom:8px; color:var(--text);">Productos vendidos:</div>';
      html +=
        '<ul style="list-style:none; padding:0; margin:0;">' +
        data.itemsSold
          .map(
            (i) => `<li style="padding:8px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
                    <span><strong>${i.qty}x</strong> ${i.name}</span>
                    <span style="color:var(--accent-light); font-weight:600;">$${(i.price * i.qty).toFixed(2)}</span>
                </li>`,
          )
          .join("") +
        "</ul>";
    } else {
      html +=
        '<div style="text-align:center; color:var(--text-dim); padding:10px;">No se vendió nada</div>';
    }

    const totalSoldPrice = Number(data.totalExpected || 0);
    const changeMoney = Number(data.changeMoney || 0);
    const moneyReturned = Number(data.moneyReturned || data.moneyCollected + changeMoney || 0);
    const totalExpected = totalSoldPrice + changeMoney;
    const isComplete = data.isComplete;
    const diff = moneyReturned - totalExpected;

    html += `<div style="margin-top:15px; padding-top:15px; border-top:2px solid var(--border);">`;
    html += `
        <div class="summary-row-alt">
            <span class="label">Productos</span>
            <span class="value">$${totalSoldPrice.toFixed(2)}</span>
        </div>
        <div class="summary-row-alt">
            <span class="label">Vuelto (Fondo)</span>
            <span class="value">$${changeMoney.toFixed(2)}</span>
        </div>
        <div class="summary-row-alt principal" style="margin-top:10px; border-top: 1px solid var(--border);">
            <span class="label">Dinero Cobrado</span>
            <span class="value">$${moneyReturned.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:.8rem; color:var(--text-dim);">
            <span>Total Esperado:</span>
            <span>$${totalExpected.toFixed(2)}</span>
        </div>
        ${
          !isComplete
            ? `<div style="text-align:right; font-size:.85rem; color:var(--red); font-weight:600;">Faltante: $${Math.abs(diff).toFixed(2)}</div>`
            : diff > 0
              ? `<div style="text-align:right; font-size:.85rem; color:var(--green); font-weight:600;">Sobrante: $${diff.toFixed(2)}</div>`
              : ""
        }
        <div style="text-align:center; margin-top:10px; font-weight:700; color:${isComplete ? "var(--green)" : "var(--red)"};">Estado: ${isComplete ? "✅ Completo" : "⚠️ Incompleto"}</div>
    `;
    html += "</div>";
    content.innerHTML = html;
    document.getElementById("logDetailsModal").classList.add("show");
  } catch (e) {
    console.error("Error mostrando detalles de deambulante", e);
  }
}

function closeLogDetails() {
  document.getElementById("logDetailsModal").classList.remove("show");
}

function checkActiveRegister() {
  db.ref("cash_sessions/active").on("value", (snap) => {
    const btnReg = document.getElementById("btnToggleRegister");
    if (!btnReg) return;

    registerSession = snap.val();

    if (currentUserRole === "admin") {
      btnReg.style.display = "block";
    } else {
      btnReg.style.display = "none";
    }

    if (!registerSession) {
      btnReg.textContent = "Abrir Caja";
      btnReg.style.background = "var(--green)";
      document.getElementById("registerStatusText").textContent =
        "⚠️ Caja cerrada - Requiere apertura";
    } else {
      btnReg.textContent = "Cerrar Caja";
      btnReg.style.background = "var(--red)";
      document.getElementById("registerStatusText").textContent =
        `Caja Abierta | Inicial: $${Number(registerSession.initial).toFixed(2)}`;
    }
  });
}

function toggleRegister() {
  const overlay = document.getElementById("registerModal");
  if (!registerSession) {
    document.getElementById("regModalTitle").textContent = "Apertura de Caja";
    document.getElementById("regOpenView").classList.remove("hidden");
    document.getElementById("regCloseView").classList.add("hidden");
    document.getElementById("regInitial").value = "";
    document.getElementById("regConfirm").textContent = "Abrir Caja";
    document.getElementById("regConfirm").style.background = "var(--green)";
  } else {
    document.getElementById("regModalTitle").textContent = "Cierre de Caja";
    document.getElementById("regOpenView").classList.add("hidden");
    document.getElementById("regCloseView").classList.remove("hidden");

    let init = Number(registerSession.initial);
    let sCash = Number(registerSession.salesCash || 0);

    document.getElementById("regSInitial").textContent = "$" + init.toFixed(2);
    document.getElementById("regSSales").textContent = "$" + sCash.toFixed(2);
    document.getElementById("regSExpected").textContent =
      "$" + (init + sCash).toFixed(2);
    document.getElementById("regConfirm").textContent = "Confirmar Cierre";
    document.getElementById("regConfirm").style.background = "var(--red)";
  }
  overlay.classList.add("show");
}

function confirmRegisterAction() {
  if (!registerSession) {
    const init = parseFloat(document.getElementById("regInitial").value);
    if (isNaN(init) || init < 0) return showToast("Monto inválido", "error");

    db.ref("cash_sessions/active").set({
      initial: init,
      salesCash: 0,
      timestampOpen: Date.now(),
      openBy: auth.currentUser ? auth.currentUser.email : "Admin",
    });
    logAction("Caja", "Abrió caja con inicial de $" + init.toFixed(2));
    showToast("Caja abierta y lista para operar", "success");
  } else {
    const sData = {
      ...registerSession,
      timestampClose: Date.now(),
      closeBy: auth.currentUser ? auth.currentUser.email : "Admin",
    };
    db.ref("cash_sessions/history").push(sData);
    db.ref("cash_sessions/active").remove();
    logAction(
      "Caja",
      `Cerró caja. Total esperado: $${(Number(sData.initial) + Number(sData.salesCash || 0)).toFixed(2)}`,
    );
    showToast("Caja cerrada con éxito", "success");
    clearCart();
  }
  document.getElementById("registerModal").classList.remove("show");
}

function renderInventory() {
  const tbody = document.getElementById("invTableBody");
  tbody.innerHTML = "";
  Object.entries(products).forEach(([id, p]) => {
    const low = p.stock <= 5;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td>${p.category || "-"}</td>
      <td><strong>$${Number(p.price).toFixed(2)}</strong></td>
      <td><span class="stock-badge ${low ? "stock-low" : "stock-ok"}">${p.stock}</span></td>
      <td>
        <button class="btn-history" data-history-id="${id}">Historial</button>
        <button class="btn-edit" data-edit-id="${id}">Editar</button>
        <button class="btn-delete" data-delete-id="${id}">Eliminar</button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".btn-edit[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.dataset.editId));
  });
  document.querySelectorAll(".btn-delete[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", () => openConfirm(btn.dataset.deleteId));
  });
  document.querySelectorAll(".btn-history[data-history-id]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openProductHistory(btn.dataset.historyId),
    );
  });
}

function openProductHistory(id) {
  const p = products[id];
  if (!p) return;
  document.getElementById("historyProductTitle").textContent =
    `Historial: ${p.name}`;
  const hBody = document.getElementById("historyProductBody");
  hBody.innerHTML = "";

  const prodSales = sales.filter((s) => s.productId === id);
  if (prodSales.length === 0) {
    hBody.innerHTML =
      '<tr><td colspan="2" style="text-align:center; padding:20px;">No hay ventas registradas</td></tr>';
  } else {
    prodSales.forEach((s) => {
      const d = new Date(s.timestamp);
      hBody.innerHTML += `<tr><td>${d.toLocaleDateString("es-MX")} ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</td><td>$${Number(s.price).toFixed(2)}</td></tr>`;
    });
  }
  document.getElementById("historyProductModal").classList.add("show");
}

function closeHistoryModal() {
  document.getElementById("historyProductModal").classList.remove("show");
}

function openModal() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Agregar Producto";
  ["mName", "mPrice", "mStock", "mImage"].forEach((id) => {
    if (document.getElementById(id)) document.getElementById(id).value = "";
  });
  document.getElementById("mCategory").value = "Comida";
  document.getElementById("productModal").classList.add("show");
}

function openEdit(id) {
  editingId = id;
  const p = products[id];
  document.getElementById("modalTitle").textContent = "Editar Producto";
  document.getElementById("mName").value = p.name;
  document.getElementById("mPrice").value = p.price;
  document.getElementById("mStock").value = p.stock;
  document.getElementById("mCategory").value = p.category || "Comida";
  if (document.getElementById("mImage"))
    document.getElementById("mImage").value = p.imageUrl || "";
  document.getElementById("productModal").classList.add("show");
}

function closeModal() {
  document.getElementById("productModal").classList.remove("show");
}

function saveProduct() {
  const name = document.getElementById("mName").value.trim();
  const price = parseFloat(document.getElementById("mPrice").value);
  const stock = parseInt(document.getElementById("mStock").value);
  const category = document.getElementById("mCategory").value;
  const imgCtrl = document.getElementById("mImage");
  const imageUrl = imgCtrl ? imgCtrl.value.trim() : "";

  if (!name) return showToast("Ingresa un nombre", "error");
  if (isNaN(price) || price < 0) return showToast("Precio inválido", "error");
  if (isNaN(stock) || stock < 0) return showToast("Stock inválido", "error");

  const data = {
    name,
    price,
    stock,
    category,
    imageUrl: imageUrl,
    sold: editingId ? products[editingId].sold || 0 : 0,
  };

  if (editingId) {
    const oldP = products[editingId];
    let changes = [];
    if (oldP.name !== data.name) changes.push(`Nombre`);
    if (Number(oldP.price) !== Number(data.price)) changes.push(`Precio`);
    if (Number(oldP.stock) !== Number(data.stock)) changes.push(`Stock`);
    if ((oldP.category || "Comida") !== data.category) changes.push(`Cat`);
    if (oldP.imageUrl !== data.imageUrl) changes.push(`Img`);

    const changeText = changes.length > 0 ? ` (${changes.join(", ")})` : "";

    db.ref("products/" + editingId).update(data);
    logAction("Edición", `Editó producto: ${oldP.name}${changeText}`);
    showToast("Producto actualizado", "info");
  } else {
    db.ref("products").push(data);
    logAction("Creación", "Creó producto: " + name);
    showToast("Producto agregado");
  }
  closeModal();
}

function openConfirm(id) {
  deletingId = id;
  document.getElementById("confirmOverlay").classList.add("show");
}

function closeConfirm() {
  document.getElementById("confirmOverlay").classList.remove("show");
  deletingId = null;
}

function confirmDelete() {
  if (!deletingId) return;
  const pName = products[deletingId]?.name || "Desconocido";
  db.ref("products/" + deletingId).remove();
  logAction("Eliminación", "Eliminó producto: " + pName);
  showToast("Producto eliminado", "error");
  closeConfirm();
}

function updateStats() {
  let filteredSales = sales;
  if (currentFilter)
    filteredSales = sales.filter((s) => s.date === currentFilter);

  const totalRev = filteredSales.reduce((a, s) => a + Number(s.price), 0);
  const totalTx = filteredSales.length;

  document.getElementById("statRevenue").textContent =
    "$" + totalRev.toFixed(2);
  document.getElementById("statTransactions").textContent = totalTx;

  const counts = {};
  filteredSales.forEach((s) => {
    counts[s.productName] = (counts[s.productName] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  document.getElementById("statTopProduct").textContent = top.length
    ? top[0][0]
    : "-";

  const hBody = document.getElementById("historyBody");
  hBody.innerHTML = "";
  filteredSales.slice(0, 100).forEach((s) => {
    const d = new Date(s.timestamp);
    const isDeambulante = (s.user || "").includes("(deambulante)");
    hBody.innerHTML += `<tr>
            <td>${d.toLocaleDateString("es-MX")} ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</td>
            <td>${s.productName}</td>
            <td style="color:var(--text-dim); font-size:0.85rem;">${isDeambulante ? "🛒 " : ""}${s.user || "-"}</td>
            <td style="color:var(--text-dim); font-size:0.85rem;">Efec: $${Number(s.cashReceived || s.price).toFixed(2)}<br>Vuelto: $${Number(s.change || 0).toFixed(2)}</td>
            <td style="color:var(--green); font-weight:700;">$${Number(s.price).toFixed(2)}</td>
            <td><button class="btn-delete" data-sale-id="${s.id}">Revertir</button></td>
        </tr>`;
  });

  document.querySelectorAll(".btn-delete[data-sale-id]").forEach((btn) => {
    btn.addEventListener("click", () => openConfirmRevert(btn.dataset.saleId));
  });

  if (document.getElementById("sec-stats").classList.contains("active"))
    renderCharts();
}

function openConfirmRevert(id) {
  revertingId = id;
  document.getElementById("revertOverlay").classList.add("show");
}

function closeConfirmRevert() {
  document.getElementById("revertOverlay").classList.remove("show");
  revertingId = null;
}

function confirmRevert() {
  if (!revertingId) return;
  const s = sales.find((x) => x.id === revertingId);
  if (!s) {
    closeConfirmRevert();
    return;
  }

  if (s.productId && products[s.productId]) {
    const p = products[s.productId];
    const updates = {};
    updates[`products/${s.productId}/stock`] = p.stock + 1;
    updates[`products/${s.productId}/sold`] = Math.max(0, (p.sold || 0) - 1);
    db.ref().update(updates);
  }

  db.ref("sales/" + revertingId).remove();
  logAction(
    "Reversión",
    "Revirtió venta de: " + (s.productName || "Desconocido"),
  );
  showToast("Venta revertida", "info");
  closeConfirmRevert();
}

function applyFilter() {
  const v = document.getElementById("filterDate").value;
  if (!v) return showToast("Selecciona una fecha", "info");
  currentFilter = v;
  updateStats();
  showToast("Filtro aplicado", "info");
}

function clearFilter() {
  currentFilter = null;
  document.getElementById("filterDate").value = "";
  updateStats();
  showToast("Filtro limpiado", "info");
}

function exportToExcel() {
  if (!sales || sales.length === 0)
    return showToast("No hay ventas para exportar", "error");

  const data = sales.map((s) => {
    const d = new Date(s.timestamp);
    const prod = products[s.productId] || {};
    return {
      Fecha: d.toLocaleDateString("es-MX"),
      Hora: d.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Producto: s.productName,
      Categoría: prod.category || "-",
      Precio: `$${Number(s.price).toFixed(2)}`,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  const colWidths = [
    { wch: 15 },
    { wch: 10 },
    { wch: 30 },
    { wch: 15 },
    { wch: 12 },
  ];
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");
  XLSX.writeFile(wb, "Historial_Ventas_PROM2026.xlsx");
  showToast("Archivo de Excel generado", "success");
}

function openUserModal() {
  document.getElementById("uEmailPrefix").value = "";
  document.getElementById("uPass").value = "";
  document.getElementById("uRole").value = "vendor";
  document.getElementById("userModal").classList.add("show");
}

function closeUserModal() {
  document.getElementById("userModal").classList.remove("show");
}

function createUserAccount() {
  const emailPrefix = document.getElementById("uEmailPrefix").value.trim();
  const pass = document.getElementById("uPass").value;
  const role = document.getElementById("uRole").value;

  if (!emailPrefix || !pass) return showToast("Completa los campos", "error");
  if (pass.length < 6)
    return showToast("La contraseña debe tener al menos 6 caracteres", "error");

  const email = emailPrefix + "@prom2026.com";

  const btn = document.getElementById("btnSaveUser");
  btn.textContent = "Creando...";
  btn.disabled = true;

  const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
  secondaryApp
    .auth()
    .createUserWithEmailAndPassword(email, pass)
    .then((cred) => {
      db.ref("users/" + cred.user.uid + "/role").set(role);
      db.ref("users/" + cred.user.uid + "/email").set(email);
      logAction("Usuario", "Creó cuenta para: " + email);
      showToast("Usuario creado exitosamente: " + email, "success");
      secondaryApp
        .auth()
        .signOut()
        .then(() => secondaryApp.delete());
      closeUserModal();
    })
    .catch((err) => {
      showToast(err.message, "error");
    })
    .finally(() => {
      btn.textContent = "Crear";
      btn.disabled = false;
    });
}

function renderCharts() {
  let filteredSales = sales;
  if (currentFilter)
    filteredSales = sales.filter((s) => s.date === currentFilter);

  const countMap = {},
    revMap = {};
  filteredSales.forEach((s) => {
    countMap[s.productName] = (countMap[s.productName] || 0) + 1;
    revMap[s.productName] = (revMap[s.productName] || 0) + Number(s.price);
  });

  const labels = Object.keys(countMap);
  const countData = labels.map((l) => countMap[l]);
  const revData = labels.map((l) => revMap[l]);
  const colors = [
    "#a855f7",
    "#ec4899",
    "#8b5cf6",
    "#d946ef",
    "#6366f1",
    "#f472b6",
    "#a78bfa",
    "#c084fc",
    "#f9a8d4",
    "#818cf8",
  ];
  const bgColors = labels.map((_, i) => colors[i % colors.length]);

  Chart.defaults.color = "rgba(248,246,240,0.6)";
  Chart.defaults.borderColor = "rgba(255,255,255,0.05)";

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Unidades vendidas",
          data: countData,
          backgroundColor: bgColors.map((c) => c + "99"),
          borderColor: bgColors,
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });

  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(document.getElementById("doughnutChart"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: revData,
          backgroundColor: bgColors.map((c) => c + "cc"),
          borderColor: "rgba(10,22,40,0.8)",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10 },
        },
      },
      cutout: "55%",
    },
  });
}

function renderLogs() {
  const tbody = document.getElementById("logsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (appLogs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center; padding:20px;">No hay registros de actividad</td></tr>';
    return;
  }

  appLogs.slice(0, 150).forEach((l) => {
    const d = new Date(l.timestamp);
    tbody.innerHTML += `<tr>
            <td>${d.toLocaleDateString("es-MX")} ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</td>
            <td style="color:var(--accent-light);">${l.user}</td>
            <td><strong>${l.action}</strong></td>
            <td>${l.detail}</td>
        </tr>`;
  });
}

function renderUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  appUsers.forEach((u) => {
    if (u.email === "a_debug@prom2026.com" || u.email === "v_debug@prom2026.com")
      return;
    const isCurrent = auth.currentUser && u.id === auth.currentUser.uid;
    const isDisabled = u.role === "disabled";
    tbody.innerHTML += `<tr>
            <td>${u.email} ${isCurrent ? '<span style="color:var(--accent-light); font-size:12px;">(Tú)</span>' : ""}</td>
            <td><span style="padding: 4px 8px; border-radius: 4px; background: ${isDisabled ? "#666" : u.role === "admin" ? "#8b5cf6" : "#a855f7"}">${u.role}</span></td>
            <td>
                ${!isCurrent && !isDisabled ? `<button class="btn-delete" onclick="revokeUserAccess('${u.id}', '${u.email}')">Deshabilitar</button>` : ""}
                ${!isCurrent && isDisabled ? `<button class="btn-edit" onclick="restoreUserAccess('${u.id}', '${u.email}')">Habilitar</button>` : ""}
            </td>
        </tr>`;
  });
}

function revokeUserAccess(id, email) {
  if (confirm(`¿Seguro que deseas deshabilitar el acceso a ${email}?`)) {
    db.ref("users/" + id + "/role").set("disabled");
    logAction("Usuario", "Deshabilitó acceso a: " + email);
    showToast("Cuenta deshabilitada", "error");
  }
}

function restoreUserAccess(id, email) {
  if (confirm(`¿Seguro que deseas habilitar el acceso a ${email}?`)) {
    db.ref("users/" + id + "/role").set("vendor");
    logAction("Usuario", "Habilitó acceso a: " + email);
    showToast("Cuenta habilitada", "success");
  }
}

function nukeProducts() {
  if (
    confirm(
      "⚠️ ¿Estás seguro de eliminar TODOS los productos? No se puede deshacer.",
    )
  ) {
    db.ref("products")
      .remove()
      .then(() => {
        logAction("Mantenimiento", "Eliminó absolutamente todos los productos");
        showToast("Catálogo de productos eliminado", "info");
      });
  }
}

function nukeSales() {
  if (confirm("⚠️ ¿Estás seguro de eliminar TODAS las ventas registradas?")) {
    db.ref("sales")
      .remove()
      .then(() => {
        logAction("Mantenimiento", "Eliminó todo el historial de ventas");
        showToast("Historial de ventas borrado", "info");
      });
  }
}

function nukeLogs() {
  if (confirm("⚠️ ¿Estás seguro de vaciar el Registro de Actividades?")) {
    db.ref("logs")
      .remove()
      .then(() => {
        logAction("Mantenimiento", "Vació el registro de actividades global");
        showToast("Registro de actividades vaciado", "info");
      });
  }
}

function nukeUsers() {
  if (
    confirm(
      "⚠️ ¿Estás seguro de eliminar a todos los usuarios creados manualmente?",
    )
  ) {
    db.ref("users").once("value", (snap) => {
      const data = snap.val() || {};
      const updates = {};
      Object.entries(data).forEach(([uid, uData]) => {
        if (
          uData.email !== "a_debug@prom2026.com" &&
          uData.email !== "v_debug@prom2026.com"
        ) {
          updates[uid] = null;
        }
      });
      db.ref("users")
        .update(updates)
        .then(() => {
          logAction(
            "Mantenimiento",
            "Eliminó las cuentas de usuario secundarias",
          );
          showToast("Limpieza de usuarios completada", "info");
        });
    });
  }
}

function nukeDeamHistory() {
  if (
    confirm(
      "⚠️ ¿Estás seguro de eliminar TODO el historial de recorridos de deambulantes?",
    )
  ) {
    db.ref("deambulantes/history")
      .remove()
      .then(() => {
        logAction("Mantenimiento", "Eliminó todo el historial de deambulantes");
        showToast("Historial de recorridos vaciado", "info");
      });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLogin").addEventListener("click", doLogin);
  document.getElementById("loginPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  document.getElementById("btnLogout").addEventListener("click", doLogout);

  document
    .getElementById("navPos")
    .addEventListener("click", () => switchSection("pos"));
  document
    .getElementById("navInventory")
    .addEventListener("click", () => switchSection("inventory"));
  document
    .getElementById("navStats")
    .addEventListener("click", () => switchSection("stats"));

  document
    .getElementById("mobileToggle")
    .addEventListener("click", toggleSidebar);
  document
    .getElementById("sidebarOverlay")
    .addEventListener("click", toggleSidebar);

  const posSearch = document.getElementById("posSearch");
  if (posSearch) {
    posSearch.addEventListener("input", () => renderPOS());
  }

  document.getElementById("btnAddProduct").addEventListener("click", openModal);

  document
    .getElementById("btnCancelModal")
    .addEventListener("click", closeModal);
  document
    .getElementById("btnSaveProduct")
    .addEventListener("click", saveProduct);

  const btnCancelHistoryModal = document.getElementById(
    "btnCancelHistoryModal",
  );
  if (btnCancelHistoryModal) {
    btnCancelHistoryModal.addEventListener("click", closeHistoryModal);
  }

  document
    .getElementById("btnCancelConfirm")
    .addEventListener("click", closeConfirm);
  document
    .getElementById("btnConfirmDelete")
    .addEventListener("click", confirmDelete);

  const btnCancelRevert = document.getElementById("btnCancelRevert");
  if (btnCancelRevert)
    btnCancelRevert.addEventListener("click", closeConfirmRevert);
  const btnConfirmRevert = document.getElementById("btnConfirmRevert");
  if (btnConfirmRevert)
    btnConfirmRevert.addEventListener("click", confirmRevert);

  document.getElementById("btnFilter").addEventListener("click", applyFilter);
  document
    .getElementById("btnClearFilter")
    .addEventListener("click", clearFilter);

  const btnExportExcel = document.getElementById("btnExportExcel");
  if (btnExportExcel) btnExportExcel.addEventListener("click", exportToExcel);

  const navUsers = document.getElementById("navUsers");
  if (navUsers)
    navUsers.addEventListener("click", () => switchSection("users"));

  const navDebug = document.getElementById("navDebug");
  if (navDebug)
    navDebug.addEventListener("click", () => switchSection("debug"));

  const btnAddUser = document.getElementById("btnAddUser");
  if (btnAddUser) btnAddUser.addEventListener("click", openUserModal);

  const navLogs = document.getElementById("navLogs");
  if (navLogs) navLogs.addEventListener("click", () => switchSection("logs"));

  const btnCancelUser = document.getElementById("btnCancelUser");
  if (btnCancelUser) btnCancelUser.addEventListener("click", closeUserModal);

  const btnSaveUser = document.getElementById("btnSaveUser");
  if (btnSaveUser) btnSaveUser.addEventListener("click", createUserAccount);

  const btnNubeProducts = document.getElementById("btnNubeProducts");
  if (btnNubeProducts) btnNubeProducts.addEventListener("click", nukeProducts);

  const btnNukeSales = document.getElementById("btnNukeSales");
  if (btnNukeSales) btnNukeSales.addEventListener("click", nukeSales);

  const btnNukeLogs = document.getElementById("btnNukeLogs");
  if (btnNukeLogs) btnNukeLogs.addEventListener("click", nukeLogs);

  const btnNukeUsers = document.getElementById("btnNukeUsers");
  if (btnNukeUsers) btnNukeUsers.addEventListener("click", nukeUsers);

  const btnNukeDeamHistory = document.getElementById("btnNukeDeamHistory");
  if (btnNukeDeamHistory)
    btnNukeDeamHistory.addEventListener("click", nukeDeamHistory);

  document.getElementById("btnClearCart")?.addEventListener("click", clearCart);
  document
    .getElementById("btnCheckout")
    ?.addEventListener("click", openCheckout);
  document
    .getElementById("chkReceivedAmt")
    ?.addEventListener("input", calculateChange);
  document
    .getElementById("chkCancel")
    ?.addEventListener("click", closeCheckoutModal);
  document
    .getElementById("chkConfirm")
    ?.addEventListener("click", completeCheckout);

  document
    .getElementById("btnToggleRegister")
    ?.addEventListener("click", toggleRegister);
  document.getElementById("regCancel")?.addEventListener("click", () => {
    document.getElementById("registerModal").classList.remove("show");
  });
  document
    .getElementById("regConfirm")
    ?.addEventListener("click", confirmRegisterAction);

  document
    .getElementById("logDetailsClose")
    ?.addEventListener("click", closeLogDetails);

  document
    .getElementById("navDeambulantes")
    ?.addEventListener("click", () => switchSection("deambulantes"));
  document
    .getElementById("btnSendDeambulante")
    ?.addEventListener("click", openSendDeambulante);
  document
    .getElementById("btnAddDeamProduct")
    ?.addEventListener("click", addDeamProductRow);
  document
    .getElementById("deamSendCancel")
    ?.addEventListener("click", () =>
      document.getElementById("sendDeambulanteModal").classList.remove("show"),
    );
  document
    .getElementById("deamSendConfirm")
    ?.addEventListener("click", confirmSendDeambulante);
  document
    .getElementById("returnDeamCancel")
    ?.addEventListener("click", () =>
      document
        .getElementById("returnDeambulanteModal")
        .classList.remove("show"),
    );
  document
    .getElementById("returnDeamConfirm")
    ?.addEventListener("click", confirmReturnDeambulante);
  document
    .getElementById("returnDeamMoney")
    ?.addEventListener("input", recalcReturnSummary);
});

let returningDeamId = null;

function initDeambulantesListeners() {
  db.ref("deambulantes/active").on("value", (snap) => {
    activeDeambulantes = snap.val() || {};
    renderDeambulantes();
  });
  db.ref("deambulantes/history")
    .orderByChild("timestampReturn")
    .limitToLast(50)
    .on("value", (snap) => {
      const data = snap.val() || {};
      deambulanteHistory = Object.entries(data).map(([k, v]) => {
        const items = Array.isArray(v.items) ? v.items : Object.values(v.items || {});
        const itemsSold = Array.isArray(v.itemsSold) ? v.itemsSold : Object.values(v.itemsSold || {});
        return {
          id: k,
          ...v,
          items,
          itemsSold
        };
      });
      deambulanteHistory.sort(
        (a, b) => (b.timestampReturn || 0) - (a.timestampReturn || 0),
      );
      renderDeambulantesHistory();
    });
}

function renderDeambulantes() {
  const container = document.getElementById("deambulantesActiveList");
  if (!container) return;
  const entries = Object.entries(activeDeambulantes);
  if (entries.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-dim); text-align:center; padding:40px;">No hay deambulantes activos</p>';
    return;
  }
  container.innerHTML = "";
  entries.forEach(([id, d]) => {
    const salida = new Date(d.timestampOut);
    const productList = d.items.map((i) => `${i.qty}x ${i.name}`).join(", ");
    container.innerHTML += `
        <div class="deam-card">
            <div class="deam-card-header">
                <div>
                    <div class="deam-card-name">${d.userName}</div>
                    <div class="deam-card-time">Salida: ${salida.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} • Cambio: $${Number(d.changeMoney).toFixed(2)}</div>
                </div>
                <button class="btn-return-deam" onclick="openReturnDeambulante('${id}')">Regreso</button>
            </div>
            <div class="deam-card-products">${productList}</div>
        </div>`;
  });
}

function renderDeambulantesHistory() {
  const tbody = document.getElementById("deambulantesHistoryBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  deambulanteHistory.forEach((d) => {
    try {
      const salida = d.timestampOut ? new Date(d.timestampOut).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      }) : "-";
      const regreso = d.timestampReturn
        ? new Date(d.timestampReturn).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-";
      
      const itemsSold = Array.isArray(d.itemsSold) ? d.itemsSold : Object.values(d.itemsSold || {});
      const totalSold = itemsSold.reduce((a, i) => a + (Number(i.qty) || 0), 0);
      
      const statusClass =
        d.status === "completo" ? "color:var(--green)" : "color:var(--red)";
      tbody.innerHTML += `<tr>
              <td>${d.userName || "Sin nombre"}</td>
              <td style="color:var(--text-dim); font-size:0.85rem;">${d.adminOut || "Admin"}</td>
              <td>${salida}</td>
              <td>${regreso}</td>
              <td>${totalSold} items</td>
              <td>$${Number(d.moneyCollected || 0).toFixed(2)}</td>
              <td style="${statusClass}; font-weight:600; text-transform:capitalize;">${d.status || "-"}</td>
          </tr>`;
    } catch (e) {
      console.error("Error al renderizar fila de historial:", e, d);
    }
  });
}

function openSendDeambulante() {
  const sel = document.getElementById("deamUserSelect");
  sel.innerHTML = '<option value="">-- Elige un vendedor --</option>';
  appUsers.forEach((u) => {
    if (u.role !== "disabled") {
      sel.innerHTML += `<option value="${u.email}">${u.email}</option>`;
    }
  });
  document.getElementById("deamProductRows").innerHTML = "";
  document.getElementById("deamChangeMoney").value = "";
  addDeamProductRow();
  document.getElementById("sendDeambulanteModal").classList.add("show");
}

function addDeamProductRow() {
  const container = document.getElementById("deamProductRows");
  const row = document.createElement("div");
  row.className = "deam-product-row";
  let options = '<option value="">-- Producto --</option>';
  Object.entries(products).forEach(([id, p]) => {
    if (p.stock > 0)
      options += `<option value="${id}">${p.name} (Stock: ${p.stock})</option>`;
  });
  row.innerHTML = `
        <select class="deam-prod-select" style="flex:1;">${options}</select>
        <input type="number" class="deam-prod-qty" placeholder="Cant." min="1" style="width:80px;">
        <button class="btn-delete" onclick="this.parentElement.remove()" style="padding:8px 12px; font-size:.8rem;">X</button>
    `;
  container.appendChild(row);
}

function confirmSendDeambulante() {
  const userName = document.getElementById("deamUserSelect").value;
  if (!userName) return showToast("Selecciona un vendedor", "error");

  const rows = document
    .getElementById("deamProductRows")
    .querySelectorAll(".deam-product-row");
  const items = [];
  let valid = true;
  rows.forEach((row) => {
    const prodId = row.querySelector(".deam-prod-select").value;
    const qty = parseInt(row.querySelector(".deam-prod-qty").value);
    if (!prodId || !qty || qty <= 0) {
      valid = false;
      return;
    }
    const p = products[prodId];
    if (!p || p.stock < qty) {
      valid = false;
      return;
    }
    items.push({ id: prodId, name: p.name, price: p.price, qty: qty });
  });
  if (!valid || items.length === 0)
    return showToast("Revisa los productos y cantidades", "error");

  const changeMoney =
    parseFloat(document.getElementById("deamChangeMoney").value) || 0;

  const updates = {};
  items.forEach((item) => {
    const p = products[item.id];
    updates[`products/${item.id}/stock`] = p.stock - item.qty;
  });
  db.ref().update(updates);

  db.ref("deambulantes/active").push({
    userName: userName,
    items: items,
    changeMoney: changeMoney,
    timestampOut: Date.now(),
    adminOut: auth.currentUser ? auth.currentUser.email : "Admin",
  });

  const prodStr = items.map((i) => `${i.qty}x ${i.name}`).join(", ");
  logAction(
    "Deambulante",
    `Envió a ${userName} con: ${prodStr} | Cambio: $${changeMoney.toFixed(2)}`,
  );
  showToast("Deambulante enviado", "success");
  document.getElementById("sendDeambulanteModal").classList.remove("show");
}

function openReturnDeambulante(id) {
  returningDeamId = id;
  const d = activeDeambulantes[id];
  if (!d) return;

  const salida = new Date(d.timestampOut);
  document.getElementById("returnDeamInfo").innerHTML = `
        <strong>${d.userName}</strong> • Salió: ${salida.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} • Cambio: $${Number(d.changeMoney).toFixed(2)}`;

  document.getElementById("returnDeamMoney").value = "";

  const rowsCont = document.getElementById("returnDeamProductRows");
  rowsCont.innerHTML = "";
  d.items.forEach((item, idx) => {
    const totalWorth = item.qty * item.price;
    rowsCont.innerHTML += `
        <div class="deam-product-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="flex:1;">
                <div style="color:var(--text); font-weight:500;">${item.name}</div>
                <div style="color:var(--text-dim); font-size:0.8rem;">Llevó: ${item.qty} ($${item.price} c/u) • Total: $${totalWorth.toFixed(2)}</div>
            </div>
            <input type="number" class="return-prod-qty" data-idx="${idx}" placeholder="Regresa" min="0" max="${item.qty}" style="width:80px;" oninput="recalcReturnSummary()">
        </div>`;
  });

  document.getElementById("returnDeamSummary").innerHTML = "";
  document.getElementById("returnDeambulanteModal").classList.add("show");
}

function recalcReturnSummary() {
  if (!returningDeamId || !activeDeambulantes[returningDeamId]) return;
  const d = activeDeambulantes[returningDeamId];
  const changeMoney = Number(d.changeMoney);
  const returnMoney =
    parseFloat(document.getElementById("returnDeamMoney").value) || 0;

  let totalSoldPrice = 0;
  d.items.forEach((item, idx) => {
    const returnedQty =
      parseInt(
        document.querySelector(`.return-prod-qty[data-idx="${idx}"]`)?.value,
      ) || 0;
    const soldQty = item.qty - returnedQty;
    totalSoldPrice += soldQty * item.price;
  });

  const totalExpected = totalSoldPrice + changeMoney;
  const isComplete = returnMoney >= totalExpected;
  const diff = returnMoney - totalExpected;

  document.getElementById("returnDeamSummary").innerHTML = `
        <div class="summary-row-alt">
            <span class="label">Productos</span>
            <span class="value">$${totalSoldPrice.toFixed(2)}</span>
        </div>
        <div class="summary-row-alt">
            <span class="label">Vuelto (Fondo)</span>
            <span class="value">$${changeMoney.toFixed(2)}</span>
        </div>
        <div class="summary-row-alt principal" style="margin-top:12px; padding-top:12px; border-top: 1px solid var(--border);">
            <span class="label">Dinero Cobrado</span>
            <span class="value">$${returnMoney.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:.8rem; color:var(--text-dim);">
            <span>Total Esperado:</span>
            <span>$${totalExpected.toFixed(2)}</span>
        </div>
        ${
          !isComplete
            ? `<div style="text-align:right; font-size:.85rem; color:var(--red); font-weight:600;">Faltante: $${Math.abs(diff).toFixed(2)}</div>`
            : diff > 0
              ? `<div style="text-align:right; font-size:.85rem; color:var(--green); font-weight:600;">Sobrante: $${diff.toFixed(2)}</div>`
              : ""
        }
        <div style="text-align:center; margin-top:15px; font-weight:700; font-size:1rem; color:${isComplete ? "var(--green)" : "var(--red)"};">
            ${isComplete ? "✅ TODO CORRECTO" : "⚠️ DINERO INCOMPLETO"}
        </div>
    `;
}

function confirmReturnDeambulante() {
  if (!returningDeamId || !activeDeambulantes[returningDeamId]) return;
  const d = activeDeambulantes[returningDeamId];
  const changeMoney = Number(d.changeMoney);
  const returnMoney =
    parseFloat(document.getElementById("returnDeamMoney").value) || 0;
  const moneyCollected = returnMoney - changeMoney;

  const itemsSold = [];
  const updates = {};
  let totalExpected = 0;

  d.items.forEach((item, idx) => {
    const returnedQty =
      parseInt(
        document.querySelector(`.return-prod-qty[data-idx="${idx}"]`)?.value,
      ) || 0;
    const soldQty = item.qty - returnedQty;

    if (returnedQty > 0 && products[item.id]) {
      updates[`products/${item.id}/stock`] =
        (products[item.id].stock || 0) + returnedQty;
    }

    if (soldQty > 0) {
      itemsSold.push({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: soldQty,
      });
      totalExpected += soldQty * item.price;
      if (products[item.id]) {
        updates[`products/${item.id}/sold`] =
          (products[item.id].sold || 0) + soldQty;
      }
    }
  });

  if (Object.keys(updates).length > 0) db.ref().update(updates);

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split("T")[0];
  itemsSold.forEach((item) => {
    for (let i = 0; i < item.qty; i++) {
      db.ref("sales").push({
        productId: item.id,
        productName: item.name,
        price: item.price,
        timestamp: timestamp,
        date: dateStr,
        user: d.userName + " (deambulante)",
        cashReceived: item.price,
        change: 0,
      });
    }
  });

  const isComplete = moneyCollected >= totalExpected;

  db.ref("deambulantes/history").push({
    userName: d.userName,
    adminOut: d.adminOut || "Admin",
    items: d.items,
    itemsSold: itemsSold,
    changeMoney: changeMoney,
    moneyReturned: returnMoney,
    moneyCollected: moneyCollected,
    timestampOut: d.timestampOut,
    timestampReturn: timestamp,
    status: isComplete ? "completo" : "incompleto",
  });

  db.ref("deambulantes/active/" + returningDeamId).remove();

  const soldStr = itemsSold.map((i) => `${i.qty}x ${i.name}`).join(", ");
  const deamDetailsData = encodeURIComponent(
    JSON.stringify({
      itemsSold,
      totalExpected,
      moneyCollected,
      changeMoney,
      moneyReturned: returnMoney,
      isComplete,
      userName: d.userName,
    }),
  );
  const detailLink = `<span style="color:var(--blue); cursor:pointer; text-decoration:underline;" onclick="showDeamDetails('${deamDetailsData}')">(ver detalle)</span>`;
  logAction(
    "Deambulante",
    `Regresó ${d.userName}. Vendió: ${soldStr || "nada"}. Recaudó: $${moneyCollected.toFixed(2)} [${isComplete ? "Completo" : "INCOMPLETO"}] ${detailLink}`,
  );

  if (!isComplete) {
    logAction(
      "Alerta",
      `Faltante detectado en regreso de ${d.userName}. Esperado: $${totalExpected.toFixed(2)}, Cobrado: $${moneyCollected.toFixed(2)} ${detailLink}`,
    );
  }

  showToast(
    isComplete
      ? "Regreso completo registrado"
      : "Regreso incompleto registrado",
    isComplete ? "success" : "info",
  );
  document.getElementById("returnDeambulanteModal").classList.remove("show");
  returningDeamId = null;
}
