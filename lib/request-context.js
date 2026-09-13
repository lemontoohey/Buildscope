// Carries the logged-in account's id through a single request's async
// call chain, so lib/store.js can scope every query to it without every
// route handler having to thread an accountId argument through by hand.
//
// Node's AsyncLocalStorage is what makes this safe under concurrent
// requests: server.js opens one context per incoming request (right after
// resolving the session cookie), and everything awaited inside that
// callback — however deep, across however many awaits — sees the same
// store even while other requests are running their own contexts in
// parallel. Nothing here is global mutable state shared between requests.
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

function run(context, fn) {
  return als.run(context, fn);
}

function getContext() {
  return als.getStore() || null;
}

function getAccountId() {
  const ctx = getContext();
  return ctx ? ctx.accountId : null;
}

module.exports = { run, getContext, getAccountId };
