/** ========================================================================
 *  ERAccess + Guard para Configurações da Kommo
 *  Este bloco é global e pode ficar no topo do script.js do widget.
 *  ======================================================================= 
 */

// === ERAccess (global) =======================================================
(function (global) {
  const NS = "ERAccess";
  const STORE_KEY = "er_allowed_screens";
  // Define o tempo de expiração das permissões de acesso (10 minutos).
  const EXPIRE_MS = 10 * 60 * 1000;
  // Guarda o identificador do temporizador para evitar múltiplos timers simultâneos.
  let expireTimer = null;

  function normId(v) { return String(v || "").trim(); }

  // NOVO: limpeza total (opcionalmente remove chaves auxiliares)
  function purge(all = false) {
    try { sessionStorage.removeItem(STORE_KEY); } catch (_) {}
    try { sessionStorage.removeItem('er_master'); } catch (_) {}
    if (all) {
      try { sessionStorage.removeItem('er_admin_emails'); } catch (_) {}
      try { sessionStorage.removeItem('er_extra_titles'); } catch (_) {}
    }
    if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
  }

  // ALTERADO: não salvar payload vazio; em vez disso, remover
  function saveAllowed(allowed) {
    try {
      const list = Array.isArray(allowed) ? allowed : [];
      // Se não houver telas, não persistimos nada (estado "não logado")
      if (!list.length) {
        purge(false);
        return;
      }
      // Armazena como objeto com lista e timestamp
      const payload = { list, ts: Date.now() };
      sessionStorage.setItem(STORE_KEY, JSON.stringify(payload));
      // Limpa qualquer timer antigo e agenda nova expiração
      if (expireTimer) clearTimeout(expireTimer);
      expireTimer = setTimeout(() => {
        try {
          sessionStorage.removeItem(STORE_KEY);
          sessionStorage.removeItem('er_master');
        } catch (_) {}
        // Dispara popup de login ou evento de expiração
        try {
          if (typeof window.erPopupLogin === 'function') {
            window.erPopupLogin();
          } else {
            const evt = new CustomEvent('erLoginExpired');
            window.dispatchEvent(evt);
          }
        } catch (_) {}
      }, EXPIRE_MS);
    } catch (_) {}
  }

  function getAllowed() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      // Caso legado: valor armazenado é um array simples
      if (Array.isArray(data)) return data;
      // Caso atual: objeto com lista e timestamp
      if (data && typeof data === 'object' && Array.isArray(data.list)) {
        // Verifica expiração
        const now = Date.now();
        if (data.ts && (now - data.ts > EXPIRE_MS)) {
          // Expirou: remove e dispara popup/login
          try { sessionStorage.removeItem(STORE_KEY); } catch (_) {}
          try { sessionStorage.removeItem('er_master'); } catch (_) {}
          try {
            if (typeof window.erPopupLogin === 'function') {
              window.erPopupLogin();
            } else {
              const evt = new CustomEvent('erLoginExpired');
              window.dispatchEvent(evt);
            }
          } catch (_) {}
          return [];
        }
        return data.list;
      }
      return [];
    } catch (_) { return []; }
  }

  /**
   * Remove/oculta elementos mapeados para telas NÃO permitidas
   * @param {string[]} allowed - ids de tela permitidos
   * @param {object} opts
   *    - root: Node onde aplicar (default: document)
   *    - mode: "remove" | "hide" (default: "remove")
   *    - selectorMap: { telaId: string[]CSSSelectors }
   *    - keepSelectors: selectors que NUNCA devem ser removidos/ocultados
   */
  function enforce(allowed, opts = {}) {
    // >>> se for master, não aplica nenhuma remoção
    try { if (sessionStorage.getItem('er_master') === '1') return; } catch (_) {}

    // >>> Patch: não aplicar nada antes do login (lista vazia)
    if (!allowed || (Array.isArray(allowed) && allowed.length === 0)) return;

    const root = opts.root || document;
    const mode = opts.mode || "remove";
    const selectorMap = opts.selectorMap || {};
    const keepSelectors = opts.keepSelectors || [];

    const allowedSet = new Set((allowed || []).map(normId));

    Object.entries(selectorMap).forEach(([id, selectors]) => {
      if (allowedSet.has(normId(id))) return; // permitido -> mantém
      (selectors || []).forEach((sel) => {
        let nodes = [];
        try { nodes = root.querySelectorAll(sel); }
        catch(e){ console.warn('[ERAccess] seletor inválido:', sel, e); nodes = []; }
        nodes.forEach((el) => {
          if (keepSelectors.length && keepSelectors.some(k => el.matches(k))) return;
          if (mode === "remove") el.remove();
          else el.classList.add("er-hidden-by-access");
        });
      });
    });
  }

  /**
   * Observa mudanças no DOM (SPA) e reaplica o enforce automaticamente
   */
  function watch(allowed, opts = {}) {
    // >>> Patch: não criar observer/1ª passada se não houver telas
    if (!allowed || (Array.isArray(allowed) && allowed.length === 0)) return () => {};
    const root = opts.root || document.body;
    const observer = new MutationObserver(() => enforce(allowed, opts));
    observer.observe(root, { childList: true, subtree: true });
    enforce(allowed, opts); // primeira passada
    return () => observer.disconnect();
  }

  function bootstrapFromStorage(opts = {}) {
    const allowed = getAllowed();
    if (allowed.length) return watch(allowed, opts);
    return () => {};
  }

  // expõe API global
  global[NS] = { enforce, watch, bootstrapFromStorage, saveAllowed, getAllowed, purge };
})(window);

// CSS opcional se usar mode:"hide":
(function addERAccessCSS() {
  if (document.getElementById('er-access-css')) return;
  const s = document.createElement('style');
  s.id = 'er-access-css';
  s.textContent = `.er-hidden-by-access{display:none!important;}`;
  document.head.appendChild(s);
})();

/** ========================================================================
 * Helpers globais para redireciono e mensagem de sem acesso
 *  - usados pelo popup global e pelo AMD
 * ======================================================================= */
(function () {
  if (!window.__goDashboard) {
    window.__goDashboard = function () {
      try {
        if (location.hash) {
          const base = location.href.split('#')[0];
          location.replace(base + '#/dashboard');
          return;
        }
        location.assign('/dashboard');
      } catch (_) {
        location.href = '/dashboard';
      }
    };
  }

  if (!window.__erShowNoSettingsAccessMessage) {
    window.__erShowNoSettingsAccessMessage = function () {
      const msg = 'Você não tem acesso a nenhuma tela das configurações. Você será redirecionado ao dashboard.';
      try {
        const id = 'er-no-access-toast';
        document.getElementById(id)?.remove();
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;z-index:99999;right:16px;top:16px;background:#111;color:#fff;padding:12px 14px;border-radius:8px;box-shadow:0 10px 20px rgba(0,0,0,.25);font:500 14px system-ui,-apple-system,Segoe UI,Roboto,Arial';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 1800);
      } catch (_) {
        try { alert(msg); } catch (_) {}
      }
    };
  }
})();

// === Popup de Login GLOBAL, fora do AMD (bem leve) =========================
(function () {
  if (window.erPopupLogin) return; // já existe (do módulo AMD), não sobrescreve

  function inSettingsPath() {
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    return full.includes('/settings');
  }

  async function getSubdomain() {
    try {
      const r = await fetch('/api/v4/account', {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (r.ok) { const acc = await r.json(); return acc?.subdomain || ''; }
    } catch(_) {}
    return '';
  }

  window.erPopupLogin = function erPopupLogin() {
    if (!inSettingsPath()) return;
    if (document.getElementById('er-login-overlay')) return;

    // Limpa qualquer resquício antes de abrir (não deixar nada salvo se não logou)
    try { window.ERAccess?.purge(true); } catch (_) {}

    const css = `
      #er-login-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:9999}
      .er-login-modal{background:#fff;color:#111;width:100%;max-width:420px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:20px 20px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
      .er-login-title{margin:0 0 12px 0;font-size:18px;font-weight:700}
      .er-login-group{margin-bottom:12px}
      .er-login-label{display:block;font-size:12px;color:#444;margin-bottom:6px}
      .er-login-input{width:90%;height:36px;padding:6px 10px;border:1px solid #dce3ea;border-radius:6px;outline:none;font-size:14px}
      .er-login-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
      .er-btn{height:36px;padding:0 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;font-size:14px}
      .er-btn-primary{background:#2b7cff;color:#fff}
      .er-btn-primary[disabled]{opacity:.6;cursor:not-allowed}
    `;
    const html = `
      <div id="er-login-overlay" aria-modal="true" role="dialog">
        <div class="er-login-modal" role="document" tabindex="-1">
          <h3 class="er-login-title">Entre para continuar</h3>
          <div class="er-login-group">
            <label class="er-login-label" for="er-login-email">E-mail</label>
            <input class="er-login-input" id="er-login-email" type="email" placeholder="seu@email.com" autocomplete="email" required>
          </div>
          <div class="er-login-group">
            <label class="er-login-label" for="er-login-pass">Senha</label>
            <input class="er-login-input" id="er-login-pass" type="password" placeholder="••••••••" autocomplete="current-password" required>
          </div>
          <div class="er-login-actions">
            <button type="button" class="er-btn er-btn-primary" id="er-btn-login">Logar</button>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement('style'); style.id='er-login-styles'; style.textContent = css;
    document.getElementById('er-login-styles')?.remove();
    document.body.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('er-login-overlay');
    const btn = document.getElementById('er-btn-login');

    overlay.addEventListener('click',(e)=>{ if(e.target===overlay){ e.stopPropagation(); e.preventDefault(); }});

    btn.addEventListener('click', async () => {
      const email = (document.getElementById('er-login-email').value || '').trim();
      const pass  = (document.getElementById('er-login-pass').value || '').trim();
      if (!email || !pass) { alert('Informe e-mail e senha.'); return; }

      btn.disabled = true; const old = btn.textContent; btn.textContent = 'Validando...';

      try {
        const domain = await getSubdomain();

        const r = await fetch('https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass, domain })
        });
        const result = await r.json();

        const ok       = !!(result?.ok ?? result?.success ?? result?.data);
        const isMaster = !!(result?.data?.is_master ?? result?.is_master);
        const telas    = (result?.data?.telas || result?.telas || []);

        if (!ok) throw new Error('Credenciais inválidas');

        // limpa flag antiga
        try { sessionStorage.removeItem('er_master'); } catch(_) {}

        // >>> sem telas = sem acesso às configurações
        if (ok && !isMaster && (!Array.isArray(telas) || telas.length === 0)) {
          try { window.ERAccess?.purge(true); } catch (_) {}
          // fecha popup
          document.getElementById('er-login-overlay')?.remove();
          document.getElementById('er-login-styles')?.remove();
          // avisa e redireciona
          __erShowNoSettingsAccessMessage();
          setTimeout(__goDashboard, 2000);
          return;
        }

        if (isMaster) {
          // master vem do banco: marcamos a flag e gravamos um allowed "sentinela"
          try { sessionStorage.setItem('er_master','1'); } catch(_){}
          window.ERAccess?.saveAllowed(['__master__']);
          window.__enableKommoSettingsAccessGuard?.();
          try { ensureLogoutItem(); } catch(_) {}
        } else {
          // usuário comum: salva telas retornadas pela API
          const uniqueAllowed = Array.from(new Set((telas || []).map(v => String(v || ''))));
          window.ERAccess?.saveAllowed(uniqueAllowed);
        }

        document.getElementById('er-login-overlay')?.remove();
        document.getElementById('er-login-styles')?.remove();
      } catch (e) {
        console.error('[login global] erro', e);
        try { window.ERAccess?.purge(true); } catch (_) {}
        alert('Credenciais inválidas ou erro ao validar.');
      } finally {
        btn.disabled = false; btn.textContent = old;
      }
    });

  };

  // Reagir à expiração
  window.addEventListener('erLoginExpired', () => {
    if (inSettingsPath()) window.erPopupLogin();
  });
})();



// === Guard para Configurações da Kommo ======================================
/**
 * Ativa/reativa o guard sempre que entrar/trocar sub-tela em /settings
 * @param {Record<string,string[]>} selectorMap - mapa "telaId" -> [selectores...]
 * @param {{mode?: 'remove'|'hide', keepSelectors?: string[]}} opts
 */
function enableKommoSettingsAccessGuard(selectorMap, opts = {}) {
  const MODE = opts.mode || "remove";
  const KEEP = opts.keepSelectors || ['#header', '.global-toast', '.notifications'];

  const normId = v => String(v||'').trim().toLowerCase();
  // Ajusta detecção de rota de configurações para corresponder qualquer URL que contenha '/settings'.
  const isSettingsPath = () => {
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    return full.includes('/settings');
  };

  const isCommunicationsSubPath = () => {
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    return /\/settings\/communications(\/|$)/.test(full);
  };

  // ---------- Filtro específico para Integrações (mantém só os cards permitidos) ----------
  const INTEGRATION_CHILDREN = {
    whatsapp:   { labels:['WhatsApp Lite'], keywords:['whatsapp lite'] },
    instagram:  { labels:['Instagram'],     keywords:['instagram'] },
    facebook:   { labels:['Facebook'],      keywords:['facebook'] },
  };

  const isIntegrationsSubPath = () => {
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    return /\/settings\/(integrations|widgets)/.test(full);
  };

  function filterIntegrationsStrict(allowed) {
    if (!isSettingsPath()) return;
    // /settings/integrations ou /settings/widgets
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    if (!/\/settings\/(integrations|widgets)/.test(full)) return;

    try { if (sessionStorage.getItem('er_master') === '1') return; } catch(_) {}
    if (!allowed || !allowed.length) return;

    const listRoot = document.querySelector('.list-widget');
    if (!listRoot) return;

    // 1) remove topo/abas
    listRoot.querySelectorAll(
      '.list__top__actions--com, .list__body-widgets-header, .widget-collection-tabs'
    ).forEach(el => el.remove());

    // 2) remove TODAS as categorias, exceto #category-wrapper-messengers
    [
      '#category-wrapper-sms',
      '#category-wrapper-live_chat',
      '#category-wrapper-forms',
      '#category-wrapper-calls',
      '#category-wrapper-workflow',
      '#category-wrapper-payments',
      '#category-wrapper-marketing',
      '#category-wrapper-integration_services',
      '#category-wrapper-industry_solutions',
      '#category-wrapper-customization',
      '#category-wrapper-chatbots',
      '#category-wrapper-analytics_data_management',
      '#category-wrapper-document_management',
      '#category-wrapper-lead_customization',
      '#category-wrapper-productivity',
      '#category-wrapper-field_customization',
      '#category-wrapper-duplicate_management',
      '#category-wrapper-others',
      '#category-wrapper-own_integrations',
      '#category-wrapper-whatsapp_providers',
    ].forEach(sel => { const el = listRoot.querySelector(sel); if (el) el.remove(); });

    // Fallback robusto: remove qualquer category-wrapper que não seja "messengers"
    listRoot.querySelectorAll('[id^="category-wrapper-"]:not(#category-wrapper-messengers)')
      .forEach(el => el.remove());

    // 3) dentro de #category-wrapper-messengers -> .widget-card-container,
    // manter somente os cards permitidos (whatsapp/instagram/facebook)
    const msg = listRoot.querySelector('#category-wrapper-messengers');
    if (!msg) return;
    const container = msg.querySelector('.widget-card-container');
    if (!container) return;

    const allowedSet = new Set(coerceToIds(allowed));
    const childAllowed = Object.keys(INTEGRATION_CHILDREN).filter(k => allowedSet.has(k));

    // Se não houver nenhum filho permitido, remove todos os cards
    let cards = Array.from(container.children);
    if (!cards.length) {
      cards = Array.from(container.querySelectorAll(
        '.widgets__list-item, .widgets__item, .widget-card, li, .card, [data-widget-id], [title]'
      ));
    }

    // Conjunto de cards a manter
    const keep = new Set();

    // Bate pelos titles/aria-labels conhecidos
    childAllowed.forEach(id => {
      const cfg = INTEGRATION_CHILDREN[id] || {};
      (cfg.labels || []).forEach(label => {
        container.querySelectorAll(
          `[title="${label}"], a[title="${label}"], [aria-label="${label}"]`
        ).forEach(el => {
          const rootCard =
            el.closest('.widget-card, .widgets__item, .widgets__list-item, li, .card, [data-widget-id]') ||
            el.closest('.widget-card-container > *') || el;
          if (rootCard) keep.add(rootCard);
        });
      });
    });

    // Fallback por texto (keywords)
    const want = (txt) =>
      childAllowed.some(id => (INTEGRATION_CHILDREN[id].keywords || [])
        .some(k => txt.includes(k)));
    cards.forEach(card => {
      const titleAttr =
        card.getAttribute?.('title') ||
        card.querySelector?.('[title]')?.getAttribute('title') ||
        card.querySelector?.('[aria-label]')?.getAttribute('aria-label') || '';
      const text = ((titleAttr || '') + ' ' + (card.textContent || '')).toLowerCase();
      if (want(text)) keep.add(card);
    });

    // Remove tudo que não está permitido
    cards.forEach(card => { if (!keep.has(card)) card.remove(); });
  }

  // ----------------------------------------------------------------------------------------

  // Lista de telas para filtrar apenas no menu lateral (#settings_aside).
  const ASIDE_CATEGORIES = ['integracoes','configuracoesgerais','ferramentascomunicacao','iakommo','agenteia','fonteconhecimento'];

  // Lista de filhos de Ferramentas de Comunicação.
  const COMMUNICATION_CHILD_IDS = ['ferramentasalesbot','ferramentarastrearclick','ferramentaativacaoia','ferramentapontuacaopromotor','ferramentainiciandoconversa'];

  const ASIDE_LABELS = {
    integracoes: 'Integrações',
    configuracoesgerais: 'Configurações Gerais',
    ferramentascomunicacao: 'Ferramentas de Comunicação',
    iakommo: 'IA da Kommo',
    agenteia: 'Agente de IA',
    fonteconhecimento: 'Fontes de Conhecimento da IA'
  };

  const LABELS_MAP = {
    integracoes: 'Integrações',
    whatsapp: 'Whatsapp Lite',
    instagram: 'Instagram',
    facebook: 'Facebook',
    configuracoesgerais: 'Configurações Gerais',
    configgerais: 'Configurações Gerais',
    configproduto: 'Produtos',
    configchatdireto: 'Chats Diretos',
    configpersonalbarralateral: 'Personalizar Barra Lateral',
    configdownloadarquivos: 'Download de Arquivos Grandes',
    configbackup: 'Backup',
    configexcluirarquivos: 'Excluir Arquivos',
    usuarios: 'Usuários',
    modelos: 'Modelos',
    ferramentascomunicacao: 'Ferramentas de Comunicação',
    ferramentasalesbot: 'Salesbot',
    ferramentarastrearclick: 'Rastrear Clicks',
    ferramentaativacaoia: 'Ativação de IA',
    ferramentapontuacaopromotor: 'Pontuação do Promotor',
    ferramentainiciandoconversa: 'Iniciando Conversas',
    iakommo: 'IA da Kommo',
    agenteia: 'Agente de IA',
    fonteconhecimento: 'Fontes de Conhecimento da IA',
    controldeacessos: 'Controle de Acessos'
  };

  const slugToId = {};
  Object.entries(LABELS_MAP).forEach(([id, label]) => {
    const slug = String(label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '');
    slugToId[slug] = id;
  });

  function mergeExtraTitlesFromStorage() {
    // extras vindos das configurações do widget (salvos pelo AMD no sessionStorage)
    let extras = [];
    try { extras = JSON.parse(sessionStorage.getItem('er_extra_titles') || '[]'); } catch(_) {}
    const add = (title) => {
      const slug = String(title||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().replace(/\s+/g,'');
      if (!LABELS_MAP[slug]) LABELS_MAP[slug] = title;
      if (!slugToId[slug])   slugToId[slug]   = slug;
    };
    // garantir Controle de Acessos
    add('Controle de Acessos');
    (extras||[]).forEach(add);
  }

  function slugifyLocal(s){
    return String(s||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/\s+/g,'');
  }
  function coerceToIds(allowed){
    const validIds = new Set(Object.keys(LABELS_MAP).map(x => x.toLowerCase().trim()));
    return (allowed||[]).map(v=>{
      const raw = String(v||'').trim();
      const low = raw.toLowerCase();
      if (validIds.has(low)) return low;             // já é um id
      const bySlug = slugToId[slugifyLocal(raw)];    // veio como label? mapeia p/ id
      return bySlug ? bySlug : low;                  // fallback
    });
  }

  const MENU_PARENT_CHILDREN = {
    integracoes: ['whatsapp', 'instagram', 'facebook'],
    ferramentascomunicacao: ['ferramentasalesbot', 'ferramentarastrearclick', 'ferramentaativacaoia', 'ferramentapontuacaopromotor', 'ferramentainiciandoconversa']
  };

  function filterCommunicationChildren(allowed) {
    if (!isSettingsPath()) return;
    if (!isCommunicationsSubPath()) return;
    try { if (sessionStorage.getItem('er_master') === '1') return; } catch(_) {}
    if (!allowed || allowed.length === 0) return;

    const allowedSet = new Set(coerceToIds(allowed));
    const parentAllowed = allowedSet.has('ferramentascomunicacao');
    const childAllowed = COMMUNICATION_CHILD_IDS.filter(id => allowedSet.has(id));

    // Pai liberado sem filhos explícitos => não remove nada nesta página
    if (parentAllowed && childAllowed.length === 0) return;

    // >>> Container correto da página de comunicações
    const workArea = document.querySelector('.work-area') || document.body;
    const commRoot =
      document.querySelector('.content__communications') ||   // <<< novo
      document.querySelector('#communications') ||
      document.querySelector('.content__settings #communications') ||
      document.querySelector('[data-section="communications"]') ||
      document.querySelector('[data-test="communications"]') ||
      workArea;

    // Se há filhos liberados, só removemos quando algum “âncora” estiver presente
    const hasAllowedAnchor = childAllowed.some(id => {
      const sels = (KOMMO_SETTINGS_SELECTOR_MAP[id] || []).filter(sel => !/\[title\s*=/.test(sel));
      return sels.some(sel => { try { return !!commRoot.querySelector(sel); } catch(_) { return false; } });
    });
    if (childAllowed.length > 0 && !hasAllowedAnchor) return;

    // Remove apenas módulos NÃO permitidos e APENAS dentro de commRoot
    COMMUNICATION_CHILD_IDS.forEach(id => {
      if (allowedSet.has(id)) return;
      const selectors = (KOMMO_SETTINGS_SELECTOR_MAP && KOMMO_SETTINGS_SELECTOR_MAP[id]) || [];
      selectors.forEach(sel => {
        if (/\[title\s*=/.test(sel)) return;
        try { commRoot.querySelectorAll(sel).forEach(el => el.remove()); } catch(_) {}
      });
    });
  }

  function filterSettingsAside(allowed) {
    if (!isSettingsPath()) return;
    const ul = document.querySelector('#settings_aside');
    if (!ul) return;

    const isLogoutLi = (li) => li && li.id === 'er-logout-item';

    const slugifyLocal = (str) => String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '');

    try {
      if (sessionStorage.getItem('er_master') === '1') return;
    } catch(_) {}
    const totalScreens = Object.keys(LABELS_MAP).length;
    if (Array.isArray(allowed) && allowed.length >= totalScreens) return;

    const allowedSet = new Set(coerceToIds(allowed));
    ul.querySelectorAll('li').forEach(li => {
      if (isLogoutLi(li)) return;
      const title = li.getAttribute('title') || li.textContent || '';
      const slug = slugifyLocal(title);
      const id = slugToId[slug];
      if (!id) { li.remove(); return; }
      if (allowedSet.has(id)) return;
      const children = MENU_PARENT_CHILDREN[id] || [];
      const hasChildAllowed = children.some(childId => allowedSet.has(childId));
      if (hasChildAllowed) return;
      li.remove();
    });
  }

  // === Logout no sidebar ======================================================
  function __erDoLogout() {
    try { sessionStorage.removeItem('er_allowed_screens'); } catch(_) {}
    try { sessionStorage.removeItem('er_master'); } catch(_) {}
    try { sessionStorage.removeItem('er_admin_emails'); } catch(_) {}
    try { sessionStorage.removeItem('er_extra_titles'); } catch(_) {}

    // Redireciona para o dashboard após limpar tudo
    try { __goDashboard(); } catch (_) { location.assign('/dashboard'); }
  }

  function ensureLogoutItem() {
    const full = ((location.pathname || '') + (location.hash || '')).toLowerCase();
    if (!full.includes('/settings')) return;

    const ul = document.querySelector('#settings_aside');
    if (!ul) return;

    let li = document.getElementById('er-logout-item');
    if (!li) {
      li = document.createElement('li');
      li.id = 'er-logout-item';
      li.className = 'aside__list-item js-filter-preset-link'
      li.setAttribute('title', 'Logout');
      li.innerHTML = `<a href="#" class="er-logout-link aside__list-item-link navigate-link-nodecor h-text-overflow js-navigate-link">Logout</a>`;
      li.addEventListener('click', function (e) {
        e.preventDefault();
        __erDoLogout();
      });
    }
    if (ul.lastElementChild !== li) ul.appendChild(li);
  }

  const resolveRoot = () => document.body;

  let stopWatching = null;
  let debounceTimer = null;
  let commObserver = null;
  const debouncedStart = (allowed) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mergeExtraTitlesFromStorage()
      const root = resolveRoot();

      if (stopWatching) { stopWatching(); stopWatching = null; }
      if (!allowed || allowed.length === 0) return;

      const ALLOWED = coerceToIds(allowed);

      const patchedSelectorMap = {};
      Object.entries(selectorMap || {}).forEach(([sid, selectors]) => {
        const idNorm = normId(sid);
        if (ASIDE_CATEGORIES.includes(idNorm) || COMMUNICATION_CHILD_IDS.includes(idNorm)) {
          patchedSelectorMap[sid] = [];
        } else {
          const filtered = (selectors || []).filter(sel => !/\[title\s*=/.test(sel));
          patchedSelectorMap[sid] = filtered;
        }
      });

      const effectiveSelectorMap = isCommunicationsSubPath()
        ? {}
        : patchedSelectorMap;

      stopWatching = window.ERAccess.watch(ALLOWED, {
        root, mode: MODE, selectorMap: effectiveSelectorMap, keepSelectors: KEEP
      });

      try { filterIntegrationsStrict(ALLOWED); } catch(e){ console.warn('[Integrations filter]', e); }
      try { filterCommunicationChildren(ALLOWED); } catch(e) { console.warn('[filterCommunicationChildren]', e); }

      if (commObserver) { try { commObserver.disconnect(); } catch(_) {} commObserver = null; }
      commObserver = new MutationObserver(() => {
        try { filterCommunicationChildren(ALLOWED); } catch(_) {}
        try { filterIntegrationsStrict(ALLOWED); } catch(_) {}
        try { ensureLogoutItem(); } catch(_) {}
      });
      try { commObserver.observe(document.body, { childList: true, subtree: true }); } catch(_) {}

      try { filterSettingsAside(ALLOWED); } catch(e) { console.warn('[filterSettingsAside]', e); }
      try { ensureLogoutItem(); } catch(e) { console.warn('[ensureLogoutItem]', e); }
    }, 50);
  };

  function start() {
    mergeExtraTitlesFromStorage();
    let allowed = window.ERAccess.getAllowed();
    if (!Array.isArray(allowed)) allowed = [];
    if (allowed.length === 0) {
      if (typeof isSettingsPath === 'function' && isSettingsPath()) {
        try {
          if (!document.getElementById('er-login-overlay') && typeof window.erPopupLogin === 'function') {
            window.erPopupLogin();
          }
        } catch(_) {}
      }
      return;
    }
    debouncedStart(allowed);
  }

  function tryStart() {
    setTimeout(start, 0);
    setTimeout(start, 180);
  }

  // SPA hooks
  const _ps = history.pushState, _rs = history.replaceState;
  history.pushState = function () { const r = _ps.apply(this, arguments); tryStart(); return r; };
  history.replaceState = function () { const r = _rs.apply(this, arguments); tryStart(); return r; };
  window.addEventListener('popstate', tryStart);
  window.addEventListener('hashchange', tryStart);

  const pageRoot = document.body;
  const ob = new MutationObserver(() => { start(); });
  ob.observe(pageRoot, { childList: true, subtree: true });

  let __lastHref = location.href;
  const hrefPoller = setInterval(() => {
    if (location.href !== __lastHref) { __lastHref = location.href; tryStart(); }
  }, 400);

  tryStart();

  return () => {
    ob.disconnect();
    clearInterval(hrefPoller);
    window.removeEventListener('popstate', tryStart);
    window.removeEventListener('hashchange', tryStart);
    if (stopWatching) stopWatching();
    if (commObserver) {
      try { commObserver.disconnect(); } catch(_) {}
      commObserver = null;
    }
  };
}

// <<< MAPEIE AQUI OS SELECTORS DE CADA TELA >>>
const KOMMO_SETTINGS_SELECTOR_MAP = {
  integracoes: [
    '[title="Integrações"]',
    '#widgets'
  ],
  whatsapp: [
    '[title="WhatsApp Lite"]',
  ],
  instagram: [
    '[title="Instagram"]',
  ],
  facebook: [
    '[title="Facebook"]',
  ],
  configuracoesgerais: [
    '[title="Configurações gerais"]',
    '#account'
  ],
  usuarios: [
    '[title="Usuários"]',
    '#users'
  ],
  modelos: [
    '[title="Modelos"]',
    '#templates'
  ],
  ferramentascomunicacao: [
    '[title="Ferramentas de comunicação"]',
    '#communications',
    '.content__communications'
  ],
  ferramentasalesbot: [
    '.safety_settings__section-bots',
  ],
  ferramentarastrearclick: [
    '.shortener__section',
  ],
  ferramentaativacaoia: [
    '.communications__helpbot-setting',
  ],
  ferramentapontuacaopromotor: [
    '#nps_holder'
  ],
  ferramentainiciandoconversa: [
    '.talk_priority_settings'
  ],
  iakommo: [
    '[title="IA da Kommo"]',
    '#AI'
  ],
  agenteia: [
    '[title="Agente de IA"]',
    '#AI_agent'
  ],
  fonteconhecimento: [
    '[title="Fontes de conhecimento da IA"]',
    '#AI_knowledge_sources'
  ],
  controldeacessos: [
    '[title="Controle de Acessos"]'
  ],
};

// expõe um helper global para (re)ligar o guard quando quiser
window.__enableKommoSettingsAccessGuard = function () {
  enableKommoSettingsAccessGuard(KOMMO_SETTINGS_SELECTOR_MAP, {
    mode: "remove",
    keepSelectors: ['#header', '.global-toast', '.notifications']
  });
};

// tenta ligar assim que a página carregar
window.__enableKommoSettingsAccessGuard();


/** ========================================================================
 *  WIDGET KOMMO (AMD)
 *  ======================================================================= 
 */

define(['jquery'], function ($) {
  let CustomWidget = function () {
    let self = this;
    let system = self.system && self.system();
    let langs = self.langs;
    self._mounted = false;

    let rowCounter = 0;

    // ========= Helpers =========

    function appendDynamicScreens(sectionEl){
      const ul = sectionEl.querySelector('.screen-list');
      const extras = parseExtraTitlesFromSettings();
      extras.forEach(title=>{
        const id = slugifyLocal(title);
        if (ul.querySelector(`[data-screen="${id}"]`)) return; // evita duplicar
        const li = document.createElement('li');
        li.className = 'screen-item level-1';
        li.dataset.screen = id;
        li.innerHTML = `
          <div class="screen-item-content">
            <div class="screen-item-label">${title}</div>
            <div class="screen-checkbox" data-checkbox="${id}"></div>
          </div>`;
        ul.appendChild(li);
      });
    }

    // apaga TODAS as telas no backend para um e-mail
    async function wipeUserScreens(userEmail) {
      if (!userEmail) return;
      try {
        await $.ajax({
          url: 'https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/cadastrar-acesso',
          method: 'POST',
          dataType: 'json',
          contentType: 'application/json',
          data: JSON.stringify({ fields: { user_email: userEmail, telas: [] } })
        });
        console.log('[wipeUserScreens] limpo para', userEmail);
      } catch (e) {
        console.warn('[wipeUserScreens] falha:', e);
      }
    }

    function parseAdminEmailsFromSettings() {
      try {
        const raw = (self.get_settings && self.get_settings().email) || '';
        return raw.split(/[,\n;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
      } catch(_) { return []; }
    }
    function parseExtraTitlesFromSettings() {
      try {
        const s = self.get_settings && self.get_settings();
        const raw = (s.additional_titles || s.widgets_titles || s.titles || s.widgets || '').trim();
        return raw ? raw.split(/[,\n;]+/).map(v=>v.trim()).filter(Boolean) : [];
      } catch(_) { return []; }
    }
    function persistSettingsHelpers() {
      try { sessionStorage.setItem('er_admin_emails', JSON.stringify(parseAdminEmailsFromSettings())); } catch(_) {}
      try { sessionStorage.setItem('er_extra_titles', JSON.stringify(parseExtraTitlesFromSettings())); } catch(_) {}
    }

    function getRoot() {
      if (self.get_settings_container) {
        const $c = self.get_settings_container();
        if ($c && $c.length) return $c;
      }
      const $v = $('#page_holder > .work-area.content__settings:visible').first();
      if ($v.length) return $v;
      const $v2 = $('.work-area.content__settings:visible').first();
      if ($v2.length) return $v2;
      return $(document.body);
    }

    function accessListEl() {
      return getRoot().find('#accessList').get(0);
    }

    function hasPendingRows() {
      const rows = getRoot().find('#accessList .access-row').toArray();
      return rows.some(r => (r.dataset.state !== 'saved'));
    }

    function updateAddButtonState() {
      const btnSave = getRoot().find('#addButton').get(0);
      const btnConfig = getRoot().find('.config-button').get(0);
      if (!btnSave || !btnConfig) return;
      const pending = hasPendingRows();
      btnSave.disabled = pending;
      btnSave.title = pending
        ? 'Finalize o cadastro/edição atual para adicionar outro usuário'
        : 'Adicionar novo Usuário';

      btnConfig.disabled = pending;
      btnConfig.title = pending
        ? 'Finalize o cadastro/edição atual para configurar os acessos do usuário'
        : 'Configurar Acessos';
    }

    function slugifyLocal(s){
      return String(s||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().replace(/\s+/g,'');
    }
    function coerceIdsLocal(list){
      const ids = new Set(Object.keys(SCREENS_LABELS).map(k => k.toLowerCase().trim()));
      const reverse = {};
      Object.entries(SCREENS_LABELS).forEach(([id,label]) => {
        reverse[slugifyLocal(label)] = id;
      });
      return (list||[]).map(v=>{
        const raw = String(v||'').trim();
        const low = raw.toLowerCase();
        if (ids.has(low)) return low;                // já é um id interno
        const byLabel = reverse[slugifyLocal(raw)];  // veio como label? mapeia p/ id
        return byLabel ? byLabel : low;              // fallback: valor normalizado
      });
    }

    const SCREENS_LABELS = {
      integracoes: 'Integrações',
      whatsapp: 'Whatsapp Lite',
      instagram: 'Instagram',
      facebook: 'Facebook',
      configuracoesgerais: 'Configurações Gerais',
      configgerais: 'Configurações Gerais',
      configproduto: 'Produtos',
      configchatdireto: 'Chats Diretos',
      configpersonalbarralateral: 'Personalizar Barra Lateral',
      configdownloadarquivos: 'Download de Arquivos Grandes',
      configbackup: 'Backup',
      configexcluirarquivos: 'Excluir Arquivos',
      usuarios: 'Usuários',
      modelos: 'Modelos',
      ferramentascomunicacao: 'Ferramentas de Comunicação',
      ferramentasalesbot: 'Salesbot',
      ferramentarastrearclick: 'Rastrear Clicks',
      ferramentaativacaoia: 'Ativação de IA',
      ferramentapontuacaopromotor: 'Pontuação do Promotor',
      ferramentainiciandoconversa: 'Iniciando Conversas',
      iakommo: 'IA da Kommo',
      agenteia: 'Agente de IA',
      fonteconhecimento: 'Fontes de Conhecimento da IA'
    };
    parseExtraTitlesFromSettings().forEach(title=>{
      const id = slugifyLocal(title);
      SCREENS_LABELS[id] = title;
    });
    function labelForScreen(id){ return SCREENS_LABELS[id] || id; }

    function applyScreensToSection(sectionEl, selectedIds){
      // limpa estado
      sectionEl.querySelectorAll('.screen-checkbox.checked').forEach(cb => cb.classList.remove('checked'));
      updateChildrenStates(sectionEl);

      const ids = coerceIdsLocal(selectedIds);

      const markChain = (id) => {
        const cb = sectionEl.querySelector(`[data-checkbox="${id}"]`);
        if (!cb){ console.warn('[applyScreensToSection] id não encontrado:', id); return; }
        const item = cb.closest('.screen-item');
        const parentId = item && item.dataset.parent;
        if (parentId) markChain(parentId); // garante pai
        if (!cb.classList.contains('checked')){
          cb.classList.add('checked');
          updateChildrenStates(sectionEl);
        }
      };

      ids.forEach(id => markChain(id));
    }

    // ========= Carregar usuários do Kommo =========
    let usersCache = null;
    let usersLoading = false;

    async function loadUsers() {
      if (usersCache) return usersCache;
      if (usersLoading) {
        return new Promise((resolve, reject) => {
          const iv = setInterval(() => {
            if (usersCache) { clearInterval(iv); resolve(usersCache); }
          }, 100);
          setTimeout(() => { clearInterval(iv); reject(new Error('Timeout ao carregar usuários')); }, 12000);
        });
      }
      usersLoading = true;
      try {
        let url = '/api/v4/users?limit=250';
        const all = [];
        while (url) {
          const r = await fetch(url, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const arr = (data && data._embedded && data._embedded.users) || [];
          for (const u of arr) {
            all.push({
              id: u.id,
              name: u.name || u.login || '',
              email: u.email || '',
              is_active: (u.is_active !== false)
            });
          }
          url = (data && data._links && data._links.next && data._links.next.href) ? data._links.next.href : null;
        }
        all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        usersCache = all;
        return usersCache;
      } finally {
        usersLoading = false;
      }
    }

    async function ensureUsersLoaded() {
      try { return await loadUsers(); }
      catch (e) { console.warn('[users] falha ao carregar', e); usersCache = []; return usersCache; }
    }

    function populateUserSelect(selectEl, selectedId) {
      selectEl.innerHTML = '<option value="">Selecione um usuário…</option>';
      if (!Array.isArray(usersCache)) return;
      usersCache.forEach(u => {
        const opt = document.createElement('option');
        opt.value = String(u.id);
        opt.textContent = u.name + (u.is_active ? '' : ' (inativo)');
        if (selectedId && String(selectedId) === String(u.id)) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    async function hydrateRowUserSelect(row) {
      const id = row.dataset.rowId;
      const select = row.querySelector(`#user-${id}`);
      if (!select) return;
      select.disabled = true;
      select.innerHTML = '<option value="">Carregando usuários…</option>';
      await ensureUsersLoaded();
      populateUserSelect(select);
      select.disabled = false;
      select.addEventListener('change', () => { if (select.value) select.classList.remove('error'); });
    }

    // ========= HTML/CSS =========
    this.renderSettings = function () {
      return `
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif; background:#f5f7fa; padding:20px; min-height:100vh; }
          .widget-container { max-width:1200px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,.1); padding:24px; }
          .widget-header{ margin-bottom:24px; }
          .widget-title{ font-size:24px; font-weight:600; color:#1f2937; margin-bottom:8px; }
          .widget-subtitle{ color:#6b7280; font-size:14px; }

          .access-row{ display:grid; grid-template-columns:1fr 1fr 1fr auto auto; gap:12px; align-items:center; padding:16px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px; background:#fafbfc; transition:all .2s ease; animation:slideIn .3s ease-out; }
          .access-row[data-state="editing"]{ border-color:#f59e0b; background:#fff8eb; }
          .access-row[data-state="unsaved"]{ border-color:#3b82f6; background:#eff6ff; }
          .access-row[data-state="saved"]{ border-color:#e5e7eb; background:#fafbfc; }

          .input-group{ display:flex; flex-direction:column; }
          .input-label{ font-size:12px; font-weight:500; color:#374151; margin-bottom:4px; }
          .input-field{ padding:10px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; transition:all .2s ease; background:#fff; }
          .input-field:focus{ outline:none; border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
          .input-field.error{ border-color:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.1); }
          .input-field[type="password"]{ font-family:monospace; }

          .action-button{ width:36px; height:36px; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s ease; }
          .config-button{ background:#f3f4f6; color:#6b7280; }
          .config-button:hover{ background:#e5e7eb; color:#374151; }
          .config-button.active{ background:#3b82f6; color:#fff; }
          .delete-button{ background:#fef2f2; color:#dc2626; }
          .delete-button:hover{ background:#fee2e2; color:#b91c1c; }

          .save-button{ background:#10b981; color:#fff; }
          .save-button:hover{ background:#059669; }

          .edit-button{ background:#f59e0b; color:#1f2937; }
          .edit-button:hover{ background:#d97706; }

          .add-button{ width:48px; height:48px; background:#3b82f6; color:#fff; border:none; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; margin:20px auto; margin-bottom:12px; font-size:24px; font-weight:600; transition:all .2s ease; box-shadow:0 4px 6px -1px rgba(59,130,246,.3); }
          .add-button:hover{ background:#2563eb; transform:translateY(-1px); box-shadow:0 6px 8px -1px rgba(59,130,246,.4); }
          .add-button:active{ transform:translateY(0); }
          .add-button[disabled]{ opacity:.5; cursor:not-allowed; box-shadow:none; transform:none; }
          .config-button[disabled]{ opacity:.5; cursor:not-allowed; box-shadow:none; transform:none; }

          .empty-state{ text-align:center; padding:40px 20px; color:#6b7280; }
          .empty-state-icon{ width:64px; height:64px; margin:0 auto 16px; opacity:.5; }

          .hidden{ display:none !important; }

          /* Seção expansível de acessos */
          .screen-access{ margin-top:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; max-height:0; opacity:0; transition:all .3s ease; grid-column:1 / -1; }
          .screen-access.expanded{ max-height:500px; opacity:1; }
          .screen-access-header{ padding:16px 20px; background:#e2e8f0; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; justify-content:space-between; }
          .screen-access-title{ font-size:16px; font-weight:600; color:#1e293b; }
          .screen-access-body{ padding:20px; max-height:350px; overflow-y:auto; }
          .screen-access-footer{ padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; gap:12px; justify-content:flex-end; }

          .screen-list{ list-style:none; margin:0; padding:0; }
          .screen-item{ margin-bottom:8px; }
          .screen-item-content{ padding:8px 12px; border-radius:6px; cursor:pointer; transition:all .2s ease; display:flex; align-items:center; justify-content:space-between; font-size:14px; color:#374151; }
          .screen-item-content:hover{ background:#f1f5f9; }
          .screen-item.level-1 .screen-item-content{ font-weight:600; color:#1f2937; }
          .screen-item.level-2 .screen-item-content{ margin-left:20px; font-weight:500; color:#4b5563; }
          .screen-item.level-3 .screen-item-content{ margin-left:40px; color:#6b7280; }
          .screen-item-label{ display:flex; align-items:center; flex:1; }
          .screen-item-label::before{ content:''; width:6px; height:6px; border-radius:50%; background:#d1d5db; margin-right:8px; flex-shrink:0; }
          .screen-item.level-1 .screen-item-label::before{ background:#3b82f6; }
          .screen-item.level-2 .screen-item-label::before{ background:#10b981; }
          .screen-item.level-3 .screen-item-label::before{ background:#f59e0b; }

          .screen-checkbox{ width:18px; height:18px; border:2px solid #d1d5db; border-radius:4px; background:#fff; cursor:pointer; position:relative; transition:all .2s ease; flex-shrink:0; }
          .screen-checkbox:hover{ border-color:#3b82f6; }
          .screen-checkbox.checked{ background:#3b82f6; border-color:#3b82f6; }
          .screen-checkbox.checked::after{ content:''; position:absolute; left:5px; top:2px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
          .screen-checkbox:disabled{ background:#f3f4f6; border-color:#e5e7eb; cursor:not-allowed; opacity:.5; }
          .screen-item.disabled{ opacity:.5; }
          .screen-item.disabled .screen-item-content{ cursor:not-allowed; }
          .screen-item.disabled .screen-item-content:hover{ background:transparent; }

          @media (max-width:768px){
            .access-row{ grid-template-columns:1fr; gap:16px; }
            .action-buttons{ display:flex; gap:8px; justify-content:flex-end; }
            .widget-container{ padding:16px; margin:10px; }
            body{ padding:10px; }
            .screen-access-body{ padding:16px; }
            .screen-access-header{ padding:12px 16px; }
            .screen-access-footer{ padding:12px 16px; }
          }
          @media (max-width:1024px) and (min-width:769px){
            .access-row{ grid-template-columns:1fr 1fr 1fr; gap:12px; }
            .action-buttons{ grid-column:1 / -1; display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
          }

          @keyframes slideIn{ from{opacity:0; transform:translateY(-10px);} to{opacity:1; transform:translateY(0);} }
          .fade-out{ animation:fadeOut .2s ease-out forwards; }
          @keyframes fadeOut{ from{opacity:1; transform:scale(1);} to{opacity:0; transform:scale(.95);} }

          .screen-button{ padding:8px 16px; border:none; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer; transition:all .2s ease; }
          .screen-button-cancel{ background:#f3f4f6; color:#6b7280; }
          .screen-button-cancel:hover{ background:#e5e7eb; color:#374151; }
          .screen-button-save{ background:#3b82f6; color:#fff; }
          .screen-button-save:hover{ background:#2563eb; }
        </style>

        <div class="widget-container" id="widget_advanced_root">
          <header class="widget-header">
            <h1 class="widget-title">Controle de Acessos</h1>
            <p class="widget-subtitle">Gerencie os acessos dos usuários do sistema</p>
          </header>

          <main id="accessList" class="access-list"></main>

          <button class="add-button" id="addButton" title="Adicionar novo acesso">+</button>
        </div>
      `;
    };

    // ========= Lógica da seção de acessos (por linha) =========
    function createScreenAccessSection(rowId) {
      const el = document.createElement('div');
      el.className = 'screen-access';
      el.dataset.screenAccessId = rowId;
      el.innerHTML = `
        <div class="screen-access-header">
          <h3 class="screen-access-title">Acesso das Telas</h3>
        </div>
        <div class="screen-access-body">
          <ul class="screen-list">
            <li class="screen-item level-1" data-screen="integracoes">
              <div class="screen-item-content">
                <div class="screen-item-label">Integrações</div>
                <div class="screen-checkbox" data-checkbox="integracoes"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="whatsapp" data-parent="integracoes">
              <div class="screen-item-content">
                <div class="screen-item-label">Whatsapp Lite</div>
                <div class="screen-checkbox" data-checkbox="whatsapp"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="instagram" data-parent="integracoes">
              <div class="screen-item-content">
                <div class="screen-item-label">Instagram</div>
                <div class="screen-checkbox" data-checkbox="instagram"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="facebook" data-parent="integracoes">
              <div class="screen-item-content">
                <div class="screen-item-label">Facebook</div>
                <div class="screen-checkbox" data-checkbox="facebook"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="configuracoesgerais">
              <div class="screen-item-content">
                <div class="screen-item-label">Configurações Gerais</div>
                <div class="screen-checkbox" data-checkbox="configuracoesgerais"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="usuarios">
              <div class="screen-item-content">
                <div class="screen-item-label">Usuários</div>
                <div class="screen-checkbox" data-checkbox="usuarios"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="modelos">
              <div class="screen-item-content">
                <div class="screen-item-label">Modelos</div>
                <div class="screen-checkbox" data-checkbox="modelos"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Ferramentas de Comunicação</div>
                <div class="screen-checkbox" data-checkbox="ferramentascomunicacao"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="ferramentasalesbot" data-parent="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Salesbot</div>
                <div class="screen-checkbox" data-checkbox="ferramentasalesbot"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="ferramentarastrearclick" data-parent="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Rastrear Clicks</div>
                <div class="screen-checkbox" data-checkbox="ferramentarastrearclick"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="ferramentaativacaoia" data-parent="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Ativação de IA</div>
                <div class="screen-checkbox" data-checkbox="ferramentaativacaoia"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="ferramentapontuacaopromotor" data-parent="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Pontuação do Promotor</div>
                <div class="screen-checkbox" data-checkbox="ferramentapontuacaopromotor"></div>
              </div>
            </li>
            <li class="screen-item level-2" data-screen="ferramentainiciandoconversa" data-parent="ferramentascomunicacao">
              <div class="screen-item-content">
                <div class="screen-item-label">Iniciando Conversas</div>
                <div class="screen-checkbox" data-checkbox="ferramentainiciandoconversa"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="iakommo">
              <div class="screen-item-content">
                <div class="screen-item-label">IA da Kommo</div>
                <div class="screen-checkbox" data-checkbox="iakommo"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="agenteia">
              <div class="screen-item-content">
                <div class="screen-item-label">Agente de IA</div>
                <div class="screen-checkbox" data-checkbox="agenteia"></div>
              </div>
            </li>
            <li class="screen-item level-1" data-screen="fonteconhecimento">
              <div class="screen-item-content">
                <div class="screen-item-label">Fontes de Conhecimento da IA</div>
                <div class="screen-checkbox" data-checkbox="fonteconhecimento"></div>
              </div>
            </li>
          </ul>
        </div>
        <div class="screen-access-footer">
          <button class="screen-button screen-button-cancel" data-action="cancel-screen">Cancelar</button>
          <button class="screen-button screen-button-save" data-action="save-screen">Salvar</button>
        </div>
      `;
      appendDynamicScreens(el);
      initCheckboxes(el);
      return el;
    }

    function initCheckboxes(container) {
      const checkboxes = container.querySelectorAll('.screen-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCheckbox(cb, container);
        });
      });

      container.querySelector('[data-action="cancel-screen"]').addEventListener('click', () => {
        const row = container.closest('.access-row');
        const btn = row.querySelector('[data-action="config"]');
        container.classList.remove('expanded');
        btn.classList.remove('active');
      });

      container.querySelector('[data-action="save-screen"]').addEventListener('click', async () => {
        const selected = getSelectedScreens(container);     // [{id,name}, ...]
        const telas = selected.map(s => s.id);
        const row = container.closest('.access-row');
        const rowId = row.dataset.rowId;

        const userEmail = (row.querySelector(`#role-${rowId}`)?.value || '').trim();
        if (!userEmail) {
          alert('Informe o e-mail do usuário antes de salvar as telas.');
          return;
        }

        try {
          await $.ajax({
            url: `https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/cadastrar-acesso`,
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ fields: { user_email: userEmail, telas } }),
            headers: { 'Content-Type': 'application/json' }
          });

          // mantém estado local
          row.dataset.screens = JSON.stringify(selected || []);
          container.classList.remove('expanded');
          row.querySelector('[data-action="config"]').classList.remove('active');
        } catch (err) {
          console.error('Falha ao salvar telas:', err);
          alert('Não foi possível salvar as telas. Tente novamente.');
        }
      });

      updateChildrenStates(container);
    }

    function toggleCheckbox(checkbox, container) {
      const isChecked = checkbox.classList.contains('checked');
      const screenItem = checkbox.closest('.screen-item');
      const screenId = checkbox.dataset.checkbox;

      if (isChecked) {
        checkbox.classList.remove('checked');
        uncheckChildren(screenId, container);
      } else {
        const parentId = screenItem && screenItem.dataset.parent;
        if (parentId) {
          const parentCheckbox = container.querySelector(`[data-checkbox="${parentId}"]`);
          if (!parentCheckbox || !parentCheckbox.classList.contains('checked')) return;
        }
        checkbox.classList.add('checked');
        enableChildren(screenId, container);
      }
      updateChildrenStates(container);
    }

    function uncheckChildren(parentId, container) {
      container.querySelectorAll(`[data-parent="${parentId}"]`).forEach((child) => {
        const childCheckbox = child.querySelector('.screen-checkbox');
        const childId = childCheckbox && childCheckbox.dataset.checkbox;
        if (childCheckbox) childCheckbox.classList.remove('checked');
        if (childId) uncheckChildren(childId, container);
      });
    }

    function enableChildren(parentId, container) {
      container.querySelectorAll(`[data-parent="${parentId}"]`).forEach((child) => {
        child.classList.remove('disabled');
        const childCheckbox = child.querySelector('.screen-checkbox');
        if (childCheckbox) childCheckbox.style.pointerEvents = 'auto';
      });
    }

    function updateChildrenStates(container) {
      container.querySelectorAll('.screen-item[data-parent]').forEach((item) => {
        const parentId = item.dataset.parent;
        const parentCheckbox = container.querySelector(`[data-checkbox="${parentId}"]`);
        const childCheckbox = item.querySelector('.screen-checkbox');

        if (!parentCheckbox || !parentCheckbox.classList.contains('checked')) {
          item.classList.add('disabled');
          if (childCheckbox) {
            childCheckbox.classList.remove('checked');
            childCheckbox.style.pointerEvents = 'none';
          }
        } else {
          item.classList.remove('disabled');
          if (childCheckbox) childCheckbox.style.pointerEvents = 'auto';
        }
      });
    }

    function resetCheckboxStates(container) {
      container.querySelectorAll('.screen-checkbox').forEach((cb) => cb.classList.remove('checked'));
      updateChildrenStates(container);
    }

    function getSelectedScreens(container) {
      const selected = [];
      container.querySelectorAll('.screen-checkbox.checked').forEach((checkbox) => {
        const screenId = checkbox.dataset.checkbox;
        const screenItem = checkbox.closest('.screen-item');
        const screenLabel = screenItem.querySelector('.screen-item-label').textContent.trim();
        selected.push({ id: screenId, name: screenLabel });
      });
      return selected;
    }

    // ========= Rows =========
    function setRowState(row, state) {
      row.dataset.state = state; // 'unsaved' | 'editing' | 'saved'
      const inputs = row.querySelectorAll('.input-field');
      const saveBtn = row.querySelector('[data-action="save"]');
      const editBtn = row.querySelector('[data-action="edit"]');

      if (state === 'saved') {
        inputs.forEach(i => { i.disabled = true; i.classList.remove('error'); });
        if (saveBtn) saveBtn.classList.add('hidden');
        if (editBtn) editBtn.classList.remove('hidden');
      } else {
        inputs.forEach(i => { i.disabled = false; });
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (editBtn) editBtn.classList.add('hidden');
      }
      updateAddButtonState();
    }

    function addRow() {
      if (hasPendingRows()) {
        alert('Salve o cadastro/edição atual antes de adicionar um novo usuário.');
        return;
      }
      rowCounter++;
      const row = createRow(rowCounter);

      const listEl = accessListEl();
      if (!listEl) { console.error('[Widget] #accessList não encontrado.'); return; }

      listEl.appendChild(row);
      setRowState(row, 'unsaved');

      hydrateRowUserSelect(row);

      const firstInput = row.querySelector('.input-field');
      if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 0);

      hideEmptyState();
      updateAddButtonState();
    }

    function createRow(id) {
      const row = document.createElement('div');
      row.className = 'access-row';
      row.dataset.rowId = id;
      row.dataset.state = 'unsaved';

      row.innerHTML = `
        <div class="input-group">
          <label class="input-label" for="user-${id}">Usuário</label>
          <select id="user-${id}" class="input-field" required>
            <option value="">Selecione um usuário…</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label" for="role-${id}">Email</label>
          <input type="text" id="role-${id}" class="input-field" placeholder="Ex: email@gmail.com" required>
        </div>
        <div class="input-group">
          <label class="input-label" for="password-${id}">Senha</label>
          <input type="password" id="password-${id}" class="input-field" placeholder="Digite a senha" required>
        </div>
        <div class="action-buttons" style="display: flex; margin-top: 1rem; gap: 10px;">
          <button class="action-button save-button" title="Salvar" data-action="save">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>
            </svg>
          </button>
          <button class="action-button edit-button hidden" title="Editar" data-action="edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
            </svg>
          </button>
          <button class="action-button config-button" title="Configurações" data-action="config">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0 -.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
            </svg>
          </button>
          <button class="action-button delete-button" title="Excluir" data-action="delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
            </svg>
          </button>
        </div>
      `;

      const screenAccess = createScreenAccessSection(id);
      row.appendChild(screenAccess);

      addRowEventListeners(row);
      return row;
    }

    function addRowEventListeners(row) {
      const configButton = row.querySelector('[data-action="config"]');
      const deleteButton = row.querySelector('[data-action="delete"]');
      const saveButton = row.querySelector('[data-action="save"]');
      const editButton = row.querySelector('[data-action="edit"]');
      const inputs = row.querySelectorAll('.input-field');

      configButton.addEventListener('click', () => toggleScreenAccess(row));
      deleteButton.addEventListener('click', () => deleteRow(row));
      saveButton.addEventListener('click', () => saveRow(row));
      editButton.addEventListener('click', () => editRow(row));

      inputs.forEach((input) => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => {
          if (input.classList.contains('error')) validateField(input);
        });
      });
    }

    async function toggleScreenAccess(row) {
      const screenAccess  = row.querySelector('.screen-access');
      const configButton  = row.querySelector('[data-action="config"]');
      const isExpanded    = screenAccess.classList.contains('expanded');

      const list = accessListEl();
      list.querySelectorAll('.screen-access.expanded').forEach(sec => { if (sec !== screenAccess) sec.classList.remove('expanded'); });
      list.querySelectorAll('.config-button.active').forEach(btn => { if (btn !== configButton) btn.classList.remove('active'); });

      if (isExpanded) {
        screenAccess.classList.remove('expanded');
        configButton.classList.remove('active');
      } else {
        screenAccess.classList.add('expanded');
        configButton.classList.add('active');

        resetCheckboxStates(screenAccess);

        const stored = row.dataset.screens ? JSON.parse(row.dataset.screens) : [];
        const storedIds = (stored || []).map(s => s.id);
        if (storedIds && storedIds.length) {
          applyScreensToSection(screenAccess, storedIds);
        } else {
          applyScreensToSection(screenAccess, []);
        }
      }
    }

    function deleteRow(row) {
      const id = row.dataset.rowId;
      const userSel = row.querySelector(`#user-${id}`);
      const userName = userSel && userSel.value ? (userSel.options[userSel.selectedIndex]?.textContent || '') : (row.querySelector('.input-field')?.value || 'este usuário');

      if (confirm(`Tem certeza que deseja remover o acesso de ${userName || 'este usuário'}?`)) {
        row.classList.add('fade-out');
        setTimeout(() => {
          row.remove();
          checkEmptyState();
          updateAddButtonState();
        }, 200);
      }
    }

    function editRow(row) {
      setRowState(row, 'editing');
      const firstInput = row.querySelector('.input-field');
      if (firstInput) firstInput.focus({ preventScroll: true });
    }

    async function saveRow(row) {
      const reqInputs = row.querySelectorAll('.input-field[required]');
      let valid = true;
      reqInputs.forEach((input) => { if (!validateField(input)) valid = false; });
      if (!valid) {
        alert('Preencha os campos obrigatórios antes de salvar.');
        return;
      }

      const id = row.dataset.rowId;
      const userSel = row.querySelector(`#user-${id}`);
      const rawUserName = userSel ? (userSel.options[userSel.selectedIndex]?.textContent || '') : '';
      const user_name = rawUserName.replace(/\s*\(inativo\)\s*$/i, '');

      const role = (row.querySelector(`#role-${id}`)?.value || '').trim();
      const password = (row.querySelector(`#password-${id}`)?.value || '').trim();
      const currentState = row.dataset.state;

      let domain = '';
      try {
        const acc = await $.getJSON('/api/v4/account');
        domain = acc?.subdomain || '';
      } catch (e) { console.warn('Erro obtendo subdomínio:', e); }

      try {
        if (currentState === 'editing') {
          const oldEmail = row.dataset.originalEmail || role;
          const payloadUpdate = {
            user_email_novo: role,
            user_email_antigo: oldEmail,
            user_domain: domain,
            user_password: password,
            user_name: user_name
          };

          await $.ajax({
            url: 'https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/alterar-usuario',
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ fields: payloadUpdate })
          });

          row.dataset.originalEmail = role;
          setRowState(row, 'saved');

        } else {
          const payloadCreate = {
            user_name,
            user_email: role,
            password,
            domain
          };

          await $.ajax({
            url: 'https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/cadastrar-usuario',
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ fields: payloadCreate })
          });

          row.dataset.originalEmail = role;
          setRowState(row, 'saved');
        }
      } catch (xhr) {
        const msg = xhr?.responseJSON?.message || 'Não foi possível salvar. Tente novamente.';
        console.error('[saveRow] falha:', xhr);
        alert(msg);
      }
    }

    // ========= Validações e coleta =========
    function validateField(input) {
      const value = (input.value || '').trim();
      const isRequired = input.hasAttribute('required');
      if (isRequired && !value) { input.classList.add('error'); return false; }
      input.classList.remove('error'); return true;
    }

    function validateAllFields() {
      const inputs = getRoot().find('#accessList .input-field[required]').toArray();
      let isValid = true;
      inputs.forEach((input) => { if (!validateField(input)) isValid = false; });
      return isValid;
    }

    function validate() { return validateAllFields(); }

    function getData() {
      const rows = getRoot().find('#accessList .access-row').toArray();
      const data = [];
      rows.forEach((row) => {
        const rowId = row.dataset.rowId;
        const userSel = row.querySelector(`#user-${rowId}`);
        const user_id = userSel && userSel.value ? Number(userSel.value) : null;
        const rawName = userSel ? (userSel.options[userSel.selectedIndex]?.textContent || '') : '';
        const user_name = rawName.replace(/\(inativo\)$/i, '').trim();

        const role = row.querySelector(`#role-${rowId}`)?.value.trim() || '';
        const password = row.querySelector(`#password-${rowId}`)?.value.trim() || '';
        const screens = row.dataset.screens ? JSON.parse(row.dataset.screens) : [];
        const state = row.dataset.state || 'unsaved';

        if (user_id || role || password) data.push({ user_id, user_name, role, password, screens, state });
      });
      return data;
    }

    function checkEmptyState() {
      const rows = getRoot().find('#accessList .access-row');
      if (!rows.length) showEmptyState(); else hideEmptyState();
    }

    function showEmptyState() {
      const list = accessListEl();
      if (!list) return;
      if (getRoot().find('#emptyState').length) return;
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.id = 'emptyState';
      emptyState.innerHTML = `
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/>
        </svg>
        <p>Nenhum acesso cadastrado</p>
        <p style="font-size:12px; margin-top:4px;">Clique no botão "+" para adicionar um novo usuário</p>
      `;
      list.appendChild(emptyState);
    }

    function hideEmptyState() {
      const emptyState = getRoot().find('#emptyState').get(0);
      if (emptyState) emptyState.remove();
    }

    // ========= Injeção/Montagem =========
    function findContainer() {
      let $c = $('#page_holder > .work-area.content__settings').filter(':visible').first();
      if ($c.length) return $c;
      $c = $('.work-area.content__settings').filter(':visible').first();
      return $c.length ? $c : null;
    }

    function WaitForContainer(maxMs, cb) {
      const deadline = Date.now() + (maxMs || 2000);
      const tryFind = () => {
        const $hit = findContainer();
        if ($hit) { cb($hit); return true; }
        return false;
      };
      if (tryFind()) return;

      const obs = new MutationObserver(() => {
        if (Date.now() > deadline) { obs.disconnect(); return; }
        if (tryFind()) obs.disconnect();
      });
      obs.observe(document.documentElement || document.body, { childList:true, subtree:true });

      const iv = setInterval(() => {
        if (tryFind() || Date.now() > deadline) { clearInterval(iv); obs.disconnect(); }
      }, 100);
    }

    async function mount() {
      if (self._mounted) return;
      WaitForContainer(2000, async function ($c) {
        let $slot = $c.find('#widget-fechar-conversa-slot');
        if (!$slot.length) {
          $slot = $('<div id="widget-fechar-conversa-slot" style="width:100%;"></div>');
          $c.append($slot);
        }

        $slot.find('#widget_advanced_root').remove();
        $slot.append(self.renderSettings());

        // popup de login na abertura (apenas em /settings)
        popupLogin();

        // Prefetch dos usuários para acelerar o primeiro select
        ensureUsersLoaded();

        // Estado inicial (lista de acessos do backend)
        await loadAndRenderExistingAccesses();

        // ativa guard se já houver telas salvas no login
        if (window.ERAccess.getAllowed().length) {
          window.__enableKommoSettingsAccessGuard();
        }

        self._mounted = true;
      });
    }

    // ========= Login Popup =========
    function lockPageScroll(){
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    function unlockPageScroll(){
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }

    function popupLogin() {
      const inSettings = /(\/|#)settings(\/|$)/i.test((location.pathname || '') + (location.hash || ''));
      if (!inSettings) return;

      const container = document.body;
      if (!container) return;

      // Sempre limpa a lista de telas permitidas ao abrir o popup de login.
      try { window.ERAccess.purge(true); } catch (_) {}

      if (document.getElementById('er-login-overlay')) return;

      const css = `
        #er-login-overlay {
          position:fixed; inset:0;
          display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,.45); z-index:9999;
        }
        .er-login-modal { max-height:90vh; overflow:auto; }
        .er-login-modal { background:#fff; color:#111; width:100%; max-width:420px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25); padding:20px 20px 16px; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
        .er-login-title { margin:0 0 12px 0; font-size:18px; font-weight:700; }
        .er-login-group { margin-bottom:12px; }
        .er-login-label { display:block; font-size:12px; color:#444; margin-bottom:6px; }
        .er-login-input { width:90%; height:36px; padding:6px 10px; border:1px solid #dce3ea; border-radius:6px; outline:none; font-size:14px; }
        .er-login-input:focus { border-color:#2b7cff; box-shadow:0 0 0 3px rgba(43,124,255,.15); }
        .er-login-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; }
        .er-btn { height:36px; padding:0 14px; border-radius:8px; border:1px solid transparent; cursor:pointer; font-weight:600; font-size:14px; }
        .er-btn-primary { background:#2b7cff; color:#fff; }
        .er-btn-primary[disabled] { opacity:.6; cursor:not-allowed; }
      `;

      const html = `
        <div id="er-login-overlay" aria-modal="true" role="dialog">
          <div class="er-login-modal" role="document" tabindex="-1">
            <h3 class="er-login-title">Entre para continuar</h3>
            <div class="er-login-group">
              <label class="er-login-label" for="er-login-email">E-mail</label>
              <input class="er-login-input" id="er-login-email" type="email" placeholder="seu@email.com" autocomplete="email" required>
            </div>
            <div class="er-login-group">
              <label class="er-login-label" for="er-login-pass">Senha</label>
              <input class="er-login-input" id="er-login-pass" type="password" placeholder="••••••••" autocomplete="current-password" required>
            </div>
            <div class="er-login-actions">
              <button type="button" class="er-btn er-btn-primary" id="er-btn-login">Logar</button>
            </div>
          </div>
        </div>
      `;

      const styleEl = document.createElement('style');
      styleEl.id = 'er-login-styles';
      styleEl.textContent = css;
      document.getElementById('er-login-styles')?.remove();
      container.appendChild(styleEl);
      container.insertAdjacentHTML('beforeend', html);

      lockPageScroll();

      const overlay = document.getElementById('er-login-overlay');
      const btn = document.getElementById('er-btn-login');

      function closePopup() {
        unlockPageScroll();
        overlay?.remove();
        document.querySelector('#er-login-styles')?.remove();
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { e.stopPropagation(); e.preventDefault(); }
      });
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault(); });

      btn.addEventListener('click', async () => {
        const email = (document.getElementById('er-login-email').value || '').trim();
        const pass  = (document.getElementById('er-login-pass').value || '').trim();
        if (!email || !pass) { alert('Informe e-mail e senha.'); return; }

        btn.disabled = true; btn.textContent = 'Validando...';

        try {
          let subdomain = '';
          try {
            const acc = await $.getJSON('/api/v4/account');
            subdomain = acc?.subdomain || '';
          } catch (e) { console.warn('Erro obtendo subdomínio:', e); }

          const result = await $.ajax({
            url: 'https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/login',
            method: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify({ email, password: pass, domain: subdomain })
          });

          const ok       = !!(result?.ok ?? result?.success ?? result?.data);
          const isMaster = !!(result?.data?.is_master ?? result?.is_master);
          const telas    = (result?.data?.telas || result?.telas || []);

          if (!ok) throw new Error('Credenciais inválidas');

          // limpa flag antiga
          try { sessionStorage.removeItem('er_master'); } catch(_) {}

          // >>> sem telas = sem acesso às configurações
          if (ok && !isMaster && (!Array.isArray(telas) || telas.length === 0)) {
            try { window.ERAccess?.purge(true); } catch (_) {}
            closePopup();
            __erShowNoSettingsAccessMessage();
            setTimeout(__goDashboard, 1200);
            return;
          }

          if (isMaster) {
            try { sessionStorage.setItem('er_master','1'); } catch(_){}
            const allScreenIds = Object.keys(KOMMO_SETTINGS_SELECTOR_MAP);
            window.ERAccess.saveAllowed(allScreenIds);

            window.__enableKommoSettingsAccessGuard?.();
            try { ensureLogoutItem(); } catch(_) {}

          } else {
            const reverseLabelMap = {};
            Object.entries(SCREENS_LABELS).forEach(([id, label]) => {
              const slug = String(label || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/\s+/g, '');
              reverseLabelMap[slug] = id;
            });
            const mapNameToId = (name) => {
              if (!name) return '';
              const slug = String(name || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/\s+/g, '');
              return reverseLabelMap[slug] || name;
            };

            const mappedTelas    = (Array.isArray(telas) ? telas : []).map(mapNameToId);
            const uniqueAllowed  = Array.from(new Set(mappedTelas));

            let isAdminEmail = parseAdminEmailsFromSettings()
              .map(s=>s.toLowerCase()).includes(email.toLowerCase());
            if (isAdminEmail && !uniqueAllowed.includes('controldeacessos')) {
              uniqueAllowed.push('controldeacessos');
            }

            window.ERAccess.saveAllowed(uniqueAllowed);
            window.__enableKommoSettingsAccessGuard?.();
            try { ensureLogoutItem(); } catch(_) {}
          }

          (function closePopupNow(){
            const overlay = document.getElementById('er-login-overlay');
            overlay?.remove();
            document.querySelector('#er-login-styles')?.remove();
          })();

          await loadAndRenderExistingAccesses();

        } catch (err) {
          console.error('[login] erro', err);
          try { window.ERAccess?.purge(true); } catch (_) {}
          alert('Credenciais inválidas ou erro ao validar.');
        } finally {
          btn.disabled = false; btn.textContent = 'Logar';
        }
      });

    }

    // se não existir global, expõe popupLogin; caso já exista (global), mantemos o global
    if (typeof window !== 'undefined' && !window.erPopupLogin) {
      window.erPopupLogin = popupLogin;
    }

    async function loadAndRenderExistingAccesses(){
      const listEl = accessListEl();
      if (!listEl) return;

      listEl.innerHTML = '';
      hideEmptyState();

      let domain = '';
      try {
        const acc = await $.getJSON('/api/v4/account');
        domain = acc?.subdomain || '';
      } catch (e) { console.warn('Erro obtendo subdomínio:', e); }

      try {
        const resp = await $.ajax({
          url: `https://sistema.evoresult.com.br/api/widget/bloqueio-informacao/listar-acessos/${domain}`,
          method: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          headers: { 'Content-Type': 'application/json' }
        });

        const payload = resp?.data;
        const data = Array.isArray(payload) ? payload : [];
        console.log('[listar-acessos] recebido:', data);

        await ensureUsersLoaded();

        if (!data.length){
          showEmptyState();
          updateAddButtonState();
          return;
        }

        data.forEach((rec) => {
          rowCounter++;
          const row = createRow(rowCounter);
          listEl.appendChild(row);

          const sel = row.querySelector(`#user-${rowCounter}`);
          populateUserSelect(sel);

          const match =
            usersCache.find(u => (u.email||'').toLowerCase() === (rec.user_email||'').toLowerCase()) ||
            usersCache.find(u => (u.name||'').trim().toLowerCase() === (rec.user_name||'').trim().toLowerCase());

          if (match) sel.value = String(match.id);

          const emailInput = row.querySelector(`#role-${rowCounter}`);
          if (emailInput) emailInput.value = rec.user_email || '';

          row.dataset.originalEmail = rec.user_email || '';

          const mapped = coerceIdsLocal(Array.isArray(rec.telas) ? rec.telas : []);
          const selectedObjs = mapped.map(id => ({ id, name: labelForScreen(id) }));
          row.dataset.screens = JSON.stringify(selectedObjs);

          setRowState(row, 'saved');
        });

        updateAddButtonState();
      } catch (e) {
        console.error('[listar-acessos] falha:', e);
        showEmptyState();
        updateAddButtonState();
      }
    }

    // ========= Callbacks Kommo =========
    this.callbacks = {
      init: function () { return true; },

      advanced_settings: function () {
        persistSettingsHelpers();
        getRoot().html(self.renderSettings());
        popupLogin();
        loadAndRenderExistingAccesses();
        window.__enableKommoSettingsAccessGuard();
        return true;
      },

      render: function () {
        try {
          const area = (self.system && typeof self.system === 'function') ? self.system().area : null;
          const inSettings = /(\/|#)settings(\/|$)/i.test((location.pathname||'') + (location.hash||''));
          if (area === 'advanced_settings' && inSettings) {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
              mount();
              persistSettingsHelpers();
            } else {
              document.addEventListener('DOMContentLoaded', mount, { once:true });
            }
          }
          return true;
        } catch (error) {
          console.log('[FecharConversa.render] error:', error);
          return true;
        }
      },

      bind_actions: function () {
        const $root = getRoot();
        $root.off('.access');

        $root.on('click.access', '#addButton', function () {
          if (hasPendingRows()) {
            alert('Salve o cadastro/edição atual antes de adicionar um novo usuário.');
            return false;
          }
          addRow();
          return true;
        });

        return true;
      },

      onSave: function () { return Promise.resolve(true); },

      destroy: function () {
        getRoot().off('.access');
        self._mounted = false;
        return true;
      }
    };

    this.validate = validate;
    this.getData = getData;

    return this;
  };

  return CustomWidget;
});

// Kickoff do popup de settings se necessário
(function immediateSettingsLoginKickoff(){
  const full = ((location.pathname||'') + (location.hash||'')).toLowerCase();
  if (!full.includes('/settings')) return;
  try {
    const raw = sessionStorage.getItem('er_allowed_screens'); // mesma key usada no ERAccess
    const isMaster = sessionStorage.getItem('er_master') === '1';
    if (!isMaster && (!raw || raw === '[]')) {
      if (typeof window.erPopupLogin === 'function') window.erPopupLogin();
    }
  } catch(_) {}
})();
