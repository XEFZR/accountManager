/* =====================================================
   CONFIGURAÇÃO — troque pelos dados do seu projeto
   ===================================================== */
const CONFIG = {
  supabaseUrl: "https://tcijxohlmbddujahzfbz.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWp4b2hsbWJkZHVqYWh6ZmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1ODEzNzUsImV4cCI6MjEwOTE1NzM3NX0.3AS6VmQ_wR5P1g9U1jaap_vB68gIjgFnNoK42ZQTBsE", // a anon key é pública; a segurança vem das políticas RLS
  apiUrl: "http://localhost:3000", // seu backend Node
  devManualAdd: true,              // true = cadastra @usuario na mão (só para testar). Em produção: false
};

// Planos: ajuste nomes, preços e limites. O limite real é reforçado no banco (schema.sql) e no backend.
const PLANS = {
  free:     { name: "Grátis",   limit: 5,   price: 0 },
  pro:      { name: "Pro",      limit: 25,  price: 49 },
  business: { name: "Business", limit: 100, price: 149 },
};

/* =====================================================
   ESTADO E ELEMENTOS
   ===================================================== */
const db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

const state = {
  user: null,
  plan: "free",
  accounts: [],
  authMode: "login", // "login" | "signup"
};

const $ = (id) => document.getElementById(id);
const el = {
  viewAuth: $("view-auth"), viewApp: $("view-app"),
  authEmail: $("auth-email"), authPassword: $("auth-password"),
  authSubmit: $("auth-submit"), authError: $("auth-error"),
  userEmail: $("user-email"), btnLogout: $("btn-logout"),
  planName: $("plan-name"), meterText: $("meter-text"), meterSlots: $("meter-slots"),
  btnAdd: $("btn-add"), btnUpgrade: $("btn-upgrade"),
  accounts: $("accounts"), empty: $("empty"),
  dlgAdd: $("dlg-add"), addField: $("add-field"), addUsername: $("add-username"),
  addError: $("add-error"), addConfirm: $("add-confirm"), addCancel: $("add-cancel"),
  dlgPlans: $("dlg-plans"), plansList: $("plans-list"), plansSub: $("plans-sub"), plansClose: $("plans-close"),
  toast: $("toast"),
};

/* =====================================================
   UTILITÁRIOS
   ===================================================== */
let toastTimer;
function toast(text) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 3500);
}

function showError(node, text) {
  node.textContent = text;
  node.hidden = !text;
}

function currentLimit() {
  return PLANS[state.plan]?.limit ?? PLANS.free.limit;
}

function authHeaders(session) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
}

function friendlyError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("limite_plano")) return "Você atingiu o limite de contas do seu plano.";
  if (msg.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered")) return "Esse e-mail já tem cadastro. Tente entrar.";
  if (msg.includes("password")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (msg.includes("duplicate")) return "Essa conta já está conectada.";
  return "Algo deu errado. Tente novamente.";
}

/* =====================================================
   AUTENTICAÇÃO
   ===================================================== */
document.querySelectorAll(".tabs__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.authMode = btn.dataset.mode;
    document.querySelectorAll(".tabs__btn").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    });
    el.authSubmit.textContent = state.authMode === "login" ? "Entrar" : "Criar conta";
    el.authPassword.autocomplete = state.authMode === "login" ? "current-password" : "new-password";
    showError(el.authError, "");
  });
});

async function submitAuth() {
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  showError(el.authError, "");

  if (!email || password.length < 8) {
    showError(el.authError, "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.");
    return;
  }

  el.authSubmit.disabled = true;
  try {
    const { data, error } =
      state.authMode === "login"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });
    if (error) throw error;

    if (state.authMode === "signup" && !data.session) {
      showError(el.authError, "");
      toast("Enviamos um link de confirmação para o seu e-mail.");
    }
  } catch (err) {
    showError(el.authError, friendlyError(err));
  } finally {
    el.authSubmit.disabled = false;
  }
}

el.authSubmit.addEventListener("click", submitAuth);
[el.authEmail, el.authPassword].forEach((i) =>
  i.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); })
);
el.btnLogout.addEventListener("click", () => db.auth.signOut());

db.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user ?? null;
  if (state.user) enterApp();
  else leaveApp();
});

/* =====================================================
   DADOS
   ===================================================== */
async function loadProfile() {
  const { data, error } = await db.from("profiles").select("plan").eq("id", state.user.id).single();
  state.plan = !error && data && PLANS[data.plan] ? data.plan : "free";
}

async function loadAccounts() {
  const { data, error } = await db
    .from("instagram_accounts")
    .select("id, username, status, created_at")
    .order("created_at", { ascending: true });
  if (error) { toast("Não foi possível carregar suas contas."); return; }
  state.accounts = data;
}

async function enterApp() {
  el.viewAuth.hidden = true;
  el.viewApp.hidden = false;
  el.userEmail.textContent = state.user.email;
  await loadProfile();
  await loadAccounts();
  render();
}

function leaveApp() {
  el.viewApp.hidden = true;
  el.viewAuth.hidden = false;
  state.accounts = [];
  state.plan = "free";
  el.authPassword.value = "";
}

/* =====================================================
   RENDER
   ===================================================== */
function render() {
  const used = state.accounts.length;
  const limit = currentLimit();
  const full = used >= limit;

  el.planName.textContent = PLANS[state.plan].name;
  el.meterText.textContent = `${used} de ${limit} contas em uso`;
  el.meterText.classList.toggle("is-full", full);

  // Medidor de espaços (limita a 12 blocos visuais para planos grandes)
  el.meterSlots.replaceChildren();
  const visible = Math.min(limit, 12);
  for (let i = 0; i < visible; i++) {
    const li = document.createElement("li");
    if (i < used) li.className = "is-used";
    el.meterSlots.appendChild(li);
  }
  if (limit > visible) {
    const more = document.createElement("li");
    more.className = "is-more";
    more.title = `+${limit - visible} espaços`;
    el.meterSlots.appendChild(more);
  }

  el.btnUpgrade.textContent = state.plan === "business" ? "Gerenciar plano" : full ? "Liberar mais contas" : "Ver planos";

  // Lista
  el.accounts.replaceChildren();
  el.empty.hidden = used > 0;
  state.accounts.forEach((acc) => el.accounts.appendChild(accountRow(acc)));
}

function accountRow(acc) {
  const li = document.createElement("li");
  li.className = "account";

  const avatar = document.createElement("div");
  avatar.className = "account__avatar";
  avatar.textContent = (acc.username[0] || "?").toUpperCase();

  const info = document.createElement("div");
  const name = document.createElement("div");
  name.className = "account__name";
  name.textContent = `@${acc.username}`;
  const meta = document.createElement("div");
  meta.className = "account__meta";
  meta.textContent = `Conectada em ${new Date(acc.created_at).toLocaleDateString("pt-BR")}`;
  info.append(name, meta);

  const badge = document.createElement("span");
  const expired = acc.status === "expired";
  badge.className = `badge ${expired ? "badge--warn" : "badge--ok"}`;
  badge.textContent = expired ? "Reconectar" : "Conectada";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn--danger";
  remove.textContent = "Remover";
  remove.setAttribute("aria-label", `Remover @${acc.username}`);
  remove.addEventListener("click", () => removeAccount(acc));

  li.append(avatar, info, badge, remove);
  return li;
}

/* =====================================================
   CONECTAR / REMOVER CONTAS
   ===================================================== */
el.btnAdd.addEventListener("click", () => {
  if (state.accounts.length >= currentLimit()) {
    openPlans(true);
    return;
  }
  showError(el.addError, "");
  el.addUsername.value = "";
  el.addField.hidden = !CONFIG.devManualAdd;
  el.addConfirm.textContent = CONFIG.devManualAdd ? "Conectar conta" : "Continuar no Instagram";
  el.dlgAdd.showModal();
});

el.addCancel.addEventListener("click", () => el.dlgAdd.close());

el.addConfirm.addEventListener("click", async () => {
  showError(el.addError, "");
  el.addConfirm.disabled = true;
  try {
    if (CONFIG.devManualAdd) {
      const username = el.addUsername.value.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(username)) {
        showError(el.addError, "Use só letras, números, ponto e sublinhado (até 30 caracteres).");
        return;
      }
      const { error } = await db.from("instagram_accounts").insert({ user_id: state.user.id, username });
      if (error) throw error;
      el.dlgAdd.close();
      await loadAccounts();
      render();
      toast(`@${username} conectada.`);
    } else {
      // Produção: seu backend monta a URL do OAuth oficial da Meta e devolve { url }.
      const { data: { session } } = await db.auth.getSession();
      const res = await fetch(`${CONFIG.apiUrl}/api/instagram/connect`, {
        method: "POST",
        headers: authHeaders(session),
      });
      if (res.status === 403) { el.dlgAdd.close(); openPlans(true); return; }
      if (!res.ok) throw new Error("connect_failed");
      const { url } = await res.json();
      window.location.href = url;
    }
  } catch (err) {
    showError(el.addError, friendlyError(err));
    if ((err?.message || "").toLowerCase().includes("limite_plano")) {
      el.dlgAdd.close();
      openPlans(true);
    }
  } finally {
    el.addConfirm.disabled = false;
  }
});

async function removeAccount(acc) {
  if (!confirm(`Remover @${acc.username}? Os agendamentos dessa conta também serão apagados.`)) return;
  const { error } = await db.from("instagram_accounts").delete().eq("id", acc.id);
  if (error) { toast("Não foi possível remover a conta."); return; }
  await loadAccounts();
  render();
  toast(`@${acc.username} removida.`);
}

/* =====================================================
   PLANOS
   ===================================================== */
function openPlans(limitReached) {
  el.plansSub.textContent = limitReached
    ? `Você usou todas as ${currentLimit()} contas do plano ${PLANS[state.plan].name}. Escolha um plano para conectar mais.`
    : "Compare os planos e mude quando quiser.";

  el.plansList.replaceChildren();
  Object.entries(PLANS).forEach(([key, plan]) => {
    const box = document.createElement("div");
    box.className = "plan" + (key === state.plan ? " is-current" : "");

    const title = document.createElement("h3");
    title.textContent = plan.name;

    const price = document.createElement("p");
    price.className = "plan__price";
    price.textContent = plan.price === 0 ? "R$ 0" : `R$ ${plan.price}`;
    if (plan.price > 0) {
      const small = document.createElement("small");
      small.textContent = " /mês";
      price.appendChild(small);
    }

    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = `Até ${plan.limit} contas conectadas`;

    const btn = document.createElement("button");
    btn.type = "button";
    if (key === state.plan) {
      btn.className = "btn btn--ghost";
      btn.textContent = "Plano atual";
      btn.disabled = true;
    } else if (plan.limit < currentLimit()) {
      btn.className = "btn btn--ghost";
      btn.textContent = "Incluído no seu plano";
      btn.disabled = true;
    } else {
      btn.className = "btn btn--accent";
      btn.textContent = `Assinar ${plan.name}`;
      btn.addEventListener("click", () => startCheckout(key, btn));
    }

    box.append(title, price, desc, btn);
    el.plansList.appendChild(box);
  });

  el.dlgPlans.showModal();
}

async function startCheckout(planKey, btn) {
  btn.disabled = true;
  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${CONFIG.apiUrl}/api/checkout`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ plan: planKey }),
    });
    if (!res.ok) throw new Error("checkout_failed");
    const { url } = await res.json(); // URL do checkout (Stripe, Mercado Pago, etc.)
    window.location.href = url;
  } catch {
    toast("Não foi possível abrir o pagamento. Tente novamente.");
    btn.disabled = false;
  }
}

el.btnUpgrade.addEventListener("click", () => openPlans(state.accounts.length >= currentLimit()));
el.plansClose.addEventListener("click", () => el.dlgPlans.close());
