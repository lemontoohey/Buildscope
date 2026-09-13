const http = require('node:http');
const { URL } = require('node:url');
const fs = require('node:fs');
const path = require('node:path');

require('./env').loadEnv();

const { parseCookies } = require('./lib/http');
const requestContext = require('./lib/request-context');
const { getSession } = require('./lib/accounts');
const authRoutes = require('./routes/auth');

const { sendHtml, sendJson, readJsonBody, redirect, notFound } = require('./lib/http');
const { handleDashboard, handleDashboardReviewApi } = require('./routes/dashboard');
const { handleBudgetPage, handleBudgetUpdate, handleBudgetNew } = require('./routes/budget');
const { handleTransactionNew, handleTransactionCreate } = require('./routes/transactions');
const { handleReceiptsNewPage, handleReceiptParseApi } = require('./routes/receipts');
const {
  handleDocumentsPage,
  handleDocumentUploadApi,
  handleDocumentFile,
} = require('./routes/documents');
const {
  handleDiaryPage,
  handleDiaryCreate,
  handleDiaryStructureApi,
  handleDiaryWeatherApi,
} = require('./routes/diary');
const {
  handlePhotosPage,
  handlePhotoUploadApi,
  handlePhotoFile,
  handlePhotoToggleDefect,
} = require('./routes/photos');
const {
  handlePurchaseOrdersPage,
  handlePurchaseOrderCreate,
  handlePurchaseOrderDetail,
  handlePurchaseOrderStatus,
  handlePurchaseOrderPrint,
} = require('./routes/purchase-orders');
const {
  handleSelectionsPage,
  handleSelectionCreate,
  handleSelectionOptionCreate,
  handleSelectionOptionChoose,
  handleSelectionStatus,
} = require('./routes/selections');
const { handleSignatureCreate } = require('./routes/signatures');
const {
  handleMaterialsPage,
  handleMaterialNew,
  handleMaterialStatus,
  handleQuoteNew,
} = require('./routes/materials');
const {
  handleQuoteImportPage,
  handleQuoteParseApi,
  handleQuoteImportConfirmApi,
} = require('./routes/quote-import');
const { handleSchedulePage, handleScheduleUpdate, handleScheduleCascade } = require('./routes/schedule');
const { handleCalculatorsPage } = require('./routes/calculators');
const {
  handlePlanMeasurePage,
  handlePlanMeasureState,
  handlePlanMeasureScale,
  handlePlanMeasureSave,
  handlePlanMeasureDelete,
  handlePlanMeasureSend,
  handlePlanMeasureTakeoffApi,
  handlePlanMeasureTakeoffConfirm,
} = require('./routes/plan-measure');
const { handleFormulatePage, handleFormulateNew, handleFormulateApply } = require('./routes/formulate');
const {
  handlePriceBookPage,
  handlePriceBookItemNew,
  handlePriceBookApplyOne,
  handlePriceBookApplyCheapest,
} = require('./routes/price-book');
const { handleTradesPage, handleTradeNew } = require('./routes/trades');
const {
  handleCompliancePage,
  handleComplianceToggle,
  handleComplianceNew,
} = require('./routes/compliance');
const {
  handleSettingsPage,
  handleSettingsAiUpdate,
  handleSettingsBackendLocal,
  handleSettingsBackendGoogleDrive,
  handleGoogleOauthStart,
  handleGoogleOauthCallback,
  handleGoogleDisconnect,
  handleXeroOauthStart,
  handleXeroOauthCallback,
  handleXeroDisconnect,
} = require('./routes/settings');
const { handleXeroPushTransaction } = require('./routes/xero');
const {
  handleEstimatorPage,
  handleEstimatorNew,
  handleEstimatorDetail,
  handleEstimatorUpdate,
  handleEstimatorStatus,
  handleEstimatorGenerate,
  handleEstimatorLineItemUpsert,
  handleEstimatorAttachmentUploadApi,
  handleEstimatorAttachmentFile,
} = require('./routes/estimator');

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(async (req, res) => {
  let pathname = '';
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());
    const flash = query.flash;
    const helpers = { sendHtml, sendJson, readJsonBody };

    // --- Auth gate ----------------------------------------------------
    // Resolved once, right here, before any route touches data -- every
    // tenant table read/write in lib/store.js depends on the account id
    // this sets up in request-context for the rest of the request.
    const cookies = parseCookies(req);
    const session = getSession(cookies[authRoutes.SESSION_COOKIE]);
    const isPublicAsset =
      pathname.startsWith('/public/') || pathname === '/manifest.webmanifest' || pathname === '/sw.js';
    const PUBLIC_AUTH_PATHS = new Set([
      '/login',
      '/signup',
      '/auth/google/start',
      '/auth/google/callback',
      '/auth/apple/start',
      '/auth/apple/callback',
      '/auth/password/login',
      '/auth/password/signup',
      '/logout',
    ]);
    if (!session && !isPublicAsset && !PUBLIC_AUTH_PATHS.has(pathname)) {
      return redirect(res, '/login');
    }
    if (session && (pathname === '/login' || pathname === '/signup')) {
      return redirect(res, '/');
    }

    return await requestContext.run({ accountId: session ? session.account_id : null }, async () => {
    // --- Auth routes ---
    if (req.method === 'GET' && pathname === '/login') {
      return await authRoutes.handleLoginPage(req, res, helpers, query);
    }
    if (req.method === 'GET' && pathname === '/signup') {
      return await authRoutes.handleSignupPage(req, res, helpers, query);
    }
    if (req.method === 'POST' && pathname === '/auth/password/login') {
      return await authRoutes.handlePasswordLogin(req, res);
    }
    if (req.method === 'POST' && pathname === '/auth/password/signup') {
      return await authRoutes.handlePasswordSignup(req, res);
    }
    if (req.method === 'GET' && pathname === '/auth/google/start') {
      return await authRoutes.handleGoogleLoginStart(req, res);
    }
    if (req.method === 'GET' && pathname === '/auth/google/callback') {
      return await authRoutes.handleGoogleLoginCallback(req, res, helpers, query);
    }
    if (req.method === 'GET' && pathname === '/auth/apple/start') {
      return await authRoutes.handleAppleLoginStart(req, res);
    }
    if (req.method === 'POST' && pathname === '/auth/apple/callback') {
      return await authRoutes.handleAppleLoginCallback(req, res);
    }
    if (req.method === 'POST' && pathname === '/logout') {
      return await authRoutes.handleLogout(req, res);
    }

    // --- GET routes ---
    if (req.method === 'GET' && pathname === '/') {
      return await handleDashboard(req, res, helpers);
    }
    if (req.method === 'GET' && pathname === '/budget') {
      return await handleBudgetPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/transactions/new') {
      return await handleTransactionNew(req, res, helpers, query);
    }
    if (req.method === 'GET' && pathname === '/receipts/new') {
      return await handleReceiptsNewPage(req, res, helpers);
    }
    if (req.method === 'GET' && pathname === '/documents') {
      return await handleDocumentsPage(req, res, helpers, query);
    }
    if (req.method === 'GET' && pathname.startsWith('/documents/file/')) {
      const id = pathname.slice('/documents/file/'.length);
      return await handleDocumentFile(req, res, id);
    }
    if (req.method === 'GET' && pathname === '/photos') {
      return await handlePhotosPage(req, res, helpers, query, flash);
    }
    if (req.method === 'GET' && pathname.startsWith('/photos/file/')) {
      const photoId = pathname.slice('/photos/file/'.length);
      return await handlePhotoFile(req, res, photoId);
    }
    if (req.method === 'GET' && pathname === '/diary') {
      return await handleDiaryPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/materials') {
      return await handleMaterialsPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/materials/import-quote') {
      return await handleQuoteImportPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/purchase-orders') {
      return await handlePurchaseOrdersPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname.startsWith('/purchase-orders/') && pathname.endsWith('/print')) {
      const poId = pathname.slice('/purchase-orders/'.length, -'/print'.length);
      return await handlePurchaseOrderPrint(req, res, poId);
    }
    if (req.method === 'GET' && pathname.startsWith('/purchase-orders/')) {
      const poId = pathname.slice('/purchase-orders/'.length);
      return await handlePurchaseOrderDetail(req, res, helpers, poId, flash);
    }
    if (req.method === 'GET' && pathname === '/selections') {
      return await handleSelectionsPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/calculators') {
      return await handleCalculatorsPage(req, res, helpers, query, flash);
    }
    if (req.method === 'GET' && pathname === '/plan-measure') {
      return await handlePlanMeasurePage(req, res, helpers, query, flash);
    }
    if (req.method === 'GET' && pathname === '/formulate') {
      return await handleFormulatePage(req, res, helpers, query, flash);
    }
    if (req.method === 'GET' && pathname === '/price-book') {
      return await handlePriceBookPage(req, res, helpers, query, flash);
    }
    if (req.method === 'GET' && pathname === '/schedule') {
      return await handleSchedulePage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/estimator') {
      return await handleEstimatorPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname.match(/^\/estimator\/(\d+)\/attachments\/([^/]+)$/)) {
      const m = pathname.match(/^\/estimator\/(\d+)\/attachments\/([^/]+)$/);
      return await handleEstimatorAttachmentFile(req, res, m[1], m[2]);
    }
    if (req.method === 'GET' && pathname.match(/^\/estimator\/(\d+)$/)) {
      const m = pathname.match(/^\/estimator\/(\d+)$/);
      return await handleEstimatorDetail(req, res, helpers, m[1], flash);
    }
    if (req.method === 'GET' && pathname.startsWith('/public/')) {
      const name = path.basename(pathname);
      const file = path.join(__dirname, 'public', name);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);
      const types = {
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
      };
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
      return;
    }
    if (req.method === 'GET' && pathname === '/manifest.webmanifest') {
      const file = path.join(__dirname, 'public', 'manifest.webmanifest');
      res.writeHead(200, { 'content-type': 'application/manifest+json' });
      res.end(fs.readFileSync(file));
      return;
    }
    if (req.method === 'GET' && pathname === '/sw.js') {
      // Served from the root (not /public/) so its default scope covers
      // the whole origin — a service worker can only control paths at or
      // below the URL it's served from.
      const file = path.join(__dirname, 'public', 'sw.js');
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(fs.readFileSync(file));
      return;
    }
    if (req.method === 'GET' && pathname === '/trades') {
      return await handleTradesPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/compliance') {
      return await handleCompliancePage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/settings') {
      return await handleSettingsPage(req, res, helpers, flash);
    }
    if (req.method === 'GET' && pathname === '/oauth/google/start') {
      return await handleGoogleOauthStart(req, res, helpers);
    }
    if (req.method === 'GET' && pathname === '/oauth/google/callback') {
      return await handleGoogleOauthCallback(req, res, helpers, query);
    }
    if (req.method === 'GET' && pathname === '/oauth/xero/start') {
      return await handleXeroOauthStart(req, res, helpers);
    }
    if (req.method === 'GET' && pathname === '/oauth/xero/callback') {
      return await handleXeroOauthCallback(req, res, helpers, query);
    }

    // --- POST routes (HTML forms) ---
    if (req.method === 'POST' && pathname === '/budget/update') {
      return await handleBudgetUpdate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/budget/new') {
      return await handleBudgetNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/transactions') {
      return await handleTransactionCreate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/diary') {
      return await handleDiaryCreate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname.startsWith('/photos/') && pathname.endsWith('/defect')) {
      const photoId = pathname.slice('/photos/'.length, -'/defect'.length);
      return await handlePhotoToggleDefect(req, res, helpers, photoId);
    }
    if (req.method === 'POST' && pathname === '/materials/new') {
      return await handleMaterialNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/purchase-orders/new') {
      return await handlePurchaseOrderCreate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname.startsWith('/purchase-orders/') && pathname.endsWith('/status')) {
      const poId = pathname.slice('/purchase-orders/'.length, -'/status'.length);
      return await handlePurchaseOrderStatus(req, res, helpers, poId);
    }
    if (req.method === 'POST' && pathname === '/selections/new') {
      return await handleSelectionCreate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/signatures') {
      return await handleSignatureCreate(req, res, helpers);
    }
    if (req.method === 'POST') {
      const chooseMatch = pathname.match(/^\/selections\/(\d+)\/options\/(\d+)\/choose$/);
      if (chooseMatch) {
        return await handleSelectionOptionChoose(req, res, helpers, chooseMatch[1], chooseMatch[2]);
      }
      const optionMatch = pathname.match(/^\/selections\/(\d+)\/options\/new$/);
      if (optionMatch) {
        return await handleSelectionOptionCreate(req, res, helpers, optionMatch[1]);
      }
      const statusMatch = pathname.match(/^\/selections\/(\d+)\/status$/);
      if (statusMatch) {
        return await handleSelectionStatus(req, res, helpers, statusMatch[1]);
      }
    }
    if (req.method === 'POST' && pathname === '/materials/status') {
      return await handleMaterialStatus(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/materials/quotes/new') {
      return await handleQuoteNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/schedule/update') {
      return await handleScheduleUpdate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/schedule/cascade') {
      return await handleScheduleCascade(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/estimator/new') {
      return await handleEstimatorNew(req, res, helpers);
    }
    if (req.method === 'POST') {
      const estUpdateMatch = pathname.match(/^\/estimator\/(\d+)\/update$/);
      if (estUpdateMatch) return await handleEstimatorUpdate(req, res, estUpdateMatch[1]);
      const estStatusMatch = pathname.match(/^\/estimator\/(\d+)\/status$/);
      if (estStatusMatch) return await handleEstimatorStatus(req, res, estStatusMatch[1]);
      const estGenerateMatch = pathname.match(/^\/estimator\/(\d+)\/generate$/);
      if (estGenerateMatch) return await handleEstimatorGenerate(req, res, estGenerateMatch[1]);
      const estLineItemMatch = pathname.match(/^\/estimator\/(\d+)\/line-items\/upsert$/);
      if (estLineItemMatch) return await handleEstimatorLineItemUpsert(req, res, estLineItemMatch[1]);
    }
    if (req.method === 'POST' && pathname === '/formulate/new') {
      return await handleFormulateNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/formulate/apply') {
      return await handleFormulateApply(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/price-book/items/new') {
      return await handlePriceBookItemNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/price-book/apply-one') {
      return await handlePriceBookApplyOne(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/price-book/apply-cheapest') {
      return await handlePriceBookApplyCheapest(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/trades/new') {
      return await handleTradeNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/compliance/toggle') {
      return await handleComplianceToggle(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/compliance/new') {
      return await handleComplianceNew(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/settings/ai') {
      return await handleSettingsAiUpdate(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/settings/backend/local') {
      return await handleSettingsBackendLocal(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/settings/backend/google_drive') {
      return await handleSettingsBackendGoogleDrive(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/settings/google/disconnect') {
      return await handleGoogleDisconnect(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/settings/xero/disconnect') {
      return await handleXeroDisconnect(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/xero/push-transaction') {
      return await handleXeroPushTransaction(req, res, helpers);
    }

    // --- POST routes (JSON APIs, used by client-side JS for file upload) ---
    if (req.method === 'POST' && pathname === '/api/receipts/parse') {
      return await handleReceiptParseApi(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/materials/quote-import/parse') {
      return await handleQuoteParseApi(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/materials/quote-import/confirm') {
      return await handleQuoteImportConfirmApi(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/documents/upload') {
      return await handleDocumentUploadApi(req, res, helpers);
    }
    if (req.method === 'POST') {
      const estAttachMatch = pathname.match(/^\/api\/estimator\/(\d+)\/attachments\/upload$/);
      if (estAttachMatch) return await handleEstimatorAttachmentUploadApi(req, res, helpers, estAttachMatch[1]);
    }
    if (req.method === 'GET' && pathname === '/api/plan-measure/state') {
      return await handlePlanMeasureState(req, res, helpers, query);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/scale') {
      return await handlePlanMeasureScale(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/measurements') {
      return await handlePlanMeasureSave(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/measurements/delete') {
      return await handlePlanMeasureDelete(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/send-to-materials') {
      return await handlePlanMeasureSend(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/takeoff') {
      return await handlePlanMeasureTakeoffApi(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/plan-measure/takeoff/confirm') {
      return await handlePlanMeasureTakeoffConfirm(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/diary/structure') {
      return await handleDiaryStructureApi(req, res, helpers);
    }
    if (req.method === 'POST' && pathname === '/api/photos/upload') {
      return await handlePhotoUploadApi(req, res, helpers);
    }
    if (req.method === 'GET' && pathname === '/api/diary/weather') {
      return await handleDiaryWeatherApi(req, res, helpers, query);
    }
    if (req.method === 'POST' && pathname === '/api/dashboard/review') {
      return await handleDashboardReviewApi(req, res, helpers);
    }

    return notFound(res);
    });
  } catch (err) {
    console.error(err);
    // A handful of store-layer errors are things a non-technical person can
    // actually act on from the Settings page (Google Drive not connected
    // yet, a bad Supabase key) — send them there with a plain-English flash
    // instead of a raw stack-trace-flavoured error page.
    const actionable = /Google Drive|Google sign-in|Supabase (REST )?error/.test(err.message);
    if (actionable && pathname !== '/settings' && !res.headersSent) {
      return redirect(res, '/settings?flash=' + encodeURIComponent(err.message));
    }
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Something went wrong: ' + err.message);
    }
  }
});

server.listen(PORT, () => {
  console.log(`Owner-build tracker running at http://localhost:${PORT}`);
});
