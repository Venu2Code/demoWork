'use strict';

(() => {
  const MAX_LEN = 200;
  const exprEl = document.getElementById('expression');
  const resultEl = document.getElementById('result');
  const historyEl = document.getElementById('history');
  let expression = '';
  let justEvaluated = false;
  let history = [];

  const pretty = (s) => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');

  function render() {
    exprEl.textContent = pretty(expression);
  }

  function showResult(text, isError = false) {
    resultEl.textContent = text;
    resultEl.classList.toggle('error', isError);
  }

  function append(key) {
    if (expression.length + key.length > MAX_LEN) return;
    // After "=", typing a digit starts fresh; typing an operator continues from the result.
    if (justEvaluated && /^[\d.(]|^sqrt/.test(key)) expression = '';
    justEvaluated = false;
    expression += key;
    if (resultEl.classList.contains('error')) showResult('0');
    render();
  }

  function clearAll() {
    expression = '';
    justEvaluated = false;
    showResult('0');
    render();
  }

  function back() {
    expression = expression.endsWith('sqrt(') ? expression.slice(0, -5) : expression.slice(0, -1);
    justEvaluated = false;
    render();
  }

  function addHistory(expr, res) {
    history.unshift({ expr, res });
    history = history.slice(0, 20);
    historyEl.replaceChildren(
      ...history.map((h) => {
        const li = document.createElement('li');
        const l = document.createElement('span');
        const r = document.createElement('strong');
        l.textContent = pretty(h.expr);
        r.textContent = `= ${h.res}`;
        li.append(l, r);
        li.addEventListener('click', () => {
          expression = String(h.res);
          justEvaluated = false;
          render();
        });
        return li;
      })
    );
  }

  async function equals() {
    if (expression.trim() === '') return;
    const sent = expression;
    try {
      const resp = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: sent }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ? data.error.message : 'Request failed');
      showResult(String(data.result));
      addHistory(sent, data.result);
      expression = String(data.result);
      justEvaluated = true;
      render();
      exprEl.textContent = `${pretty(sent)} =`;
    } catch (err) {
      showResult(err.message || 'Error', true);
    }
  }

  document.getElementById('keys').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.key) append(btn.dataset.key);
    else if (btn.dataset.action === 'clear') clearAll();
    else if (btn.dataset.action === 'back') back();
    else if (btn.dataset.action === 'equals') equals();
  });

  document.getElementById('clear-history').addEventListener('click', () => {
    history = [];
    historyEl.replaceChildren();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[\d.+\-*/%^()]$/.test(e.key)) { e.preventDefault(); append(e.key); }
    else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Escape') clearAll();
  });
})();
