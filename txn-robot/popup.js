const rows = document.getElementById("rows");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

function copyText(t, btn) {
  navigator.clipboard.writeText(t).then(() => {
    if (btn) { btn.textContent = "copied"; setTimeout(() => (btn.textContent = "JSON"), 900); }
  });
}

function fmt(t) {
  try { return new Date(t).toISOString().slice(11, 23) + "Z"; } catch (e) { return t; }
}

chrome.storage.local.get("captures", (res) => {
  const list = (res.captures || []).slice().reverse();
  count.textContent = list.length + " captured";
  document.getElementById("copy-all").onclick = () =>
    copyText(JSON.stringify(list.slice().reverse(), null, 2));
  document.getElementById("clear").onclick = () =>
    chrome.storage.local.set({ captures: [] }, () => location.reload());
  if (!list.length) return;
  empty.style.display = "none";
  for (const e of list) {
    const tr = document.createElement("tr");
    const tdT = document.createElement("td"); tdT.textContent = fmt(e.time);
    const tdM = document.createElement("td"); tdM.textContent = e.method;
    const tdS = document.createElement("td"); tdS.textContent = e.status;
    const tdU = document.createElement("td"); tdU.className = "url"; tdU.textContent = e.url;
    const tdB = document.createElement("td");
    const b = document.createElement("button");
    b.textContent = "JSON";
    b.onclick = () => copyText(JSON.stringify(e, null, 2), b);
    tdB.appendChild(b);
    tr.append(tdT, tdM, tdS, tdU, tdB);
    rows.appendChild(tr);
  }
});
