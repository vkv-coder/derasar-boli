// ==========================================
// DERASAR BOLI - Receipt Generator (v3 - Multi-tenant)
// ==========================================

function buildTempleHeader(org) {
  if (!org) org = {};
  return `
  <div class="org-header">
    ${org.namah_text ? `<div class="org-namah">${org.namah_text}</div>` : ''}
    <div class="org-name">${org.name || 'Derasar Boli'}</div>
    ${org.address ? `<div class="org-addr">${org.address}</div>` : ''}
    ${org.pan_no ? `<div class="org-reg">PAN : ${org.pan_no}</div>` : ''}
  </div>`;
}

const RECEIPT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hind Vadodara','Noto Sans Gujarati',Arial,sans-serif;background:#f0ece4;display:flex;flex-direction:column;align-items:center;padding:24px;gap:16px;min-height:100vh}
  .receipt{background:#fff;width:360px;border:3px solid #c00;border-radius:4px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.18)}
  .org-header{border-bottom:2px solid #c00;padding:10px 12px;text-align:center;background:#fff}
  .org-namah{font-size:12px;color:#555;margin-bottom:3px}
  .org-name{font-size:15px;font-weight:700;color:#c00;line-height:1.35;margin-bottom:3px}
  .org-addr{font-size:11px;color:#444;line-height:1.4;margin-bottom:3px}
  .org-reg{font-size:9.5px;color:#666;line-height:1.4;border-top:1px solid #eee;padding-top:4px;margin-top:4px}
  .receipt-body{padding:12px}
  .receipt-title{display:flex;justify-content:space-between;align-items:center;color:#c00;border:1.5px solid #c00;padding:5px 8px;margin-bottom:10px}
  .receipt-title .rt-label{font-size:10px;font-weight:600;letter-spacing:2px}
  .receipt-title .rt-no{font-size:19px;font-weight:800;letter-spacing:0.5px}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:10px}
  .row{display:flex;border-bottom:1px solid #e0c0c0;padding:5px 0;align-items:flex-start;font-size:13px}
  .row-label{color:#555;width:110px;flex-shrink:0;font-size:12px}
  .row-value{font-weight:600;color:#1a1a1a;flex:1}
  .heads-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
  .heads-table th{background:#c00;color:#fff;padding:5px 6px;text-align:left;font-weight:600}
  .heads-table th:last-child{text-align:right}
  .heads-table td{padding:5px 6px;border-bottom:1px solid #e0c0c0;vertical-align:top}
  .heads-table td:last-child{text-align:right;font-weight:700;color:#c00;white-space:nowrap}
  .heads-table tr:last-child td{border-bottom:none}
  .total-row{display:flex;justify-content:space-between;padding:8px 6px;background:#fff4f4;border:1.5px solid #c00;border-radius:3px;margin-bottom:6px;font-weight:700;font-size:14px}
  .total-row .lbl{color:#555;font-size:12px}
  .total-row .val{color:#c00;font-size:16px}
  .words-row{text-align:center;font-size:11.5px;color:#333;font-style:italic;margin-bottom:10px;padding:4px 6px;background:#FFF8F0;border-radius:3px}
  .pay-info{font-size:11px;color:#555;margin-bottom:10px;padding:6px;background:#f9f9f9;border:1px solid #e8e8e8;border-radius:3px;line-height:1.8}
  .pay-info strong{color:#333}
  .sys-note{text-align:center;font-size:9.5px;color:#888;margin-top:10px;padding:6px 4px;border-top:1px dashed #ddd;line-height:1.6}
  .footer{text-align:center;color:#c00;font-weight:700;font-size:13px;padding:8px 0 4px}
  .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px}
  .btn{padding:10px 18px;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600}
  .btn-print{background:#c00;color:#fff}
  .btn-dl{background:#1565C0;color:#fff}
  .btn-wa{background:#25D366;color:#fff}
  .btn-close{background:#e8e8e8;color:#333}
  .pending-badge{display:inline-block;background:#ff9800;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-bottom:6px}
  @media print{
    @page{size:105mm 148mm;margin:4mm}
    body{background:#fff;padding:0;margin:0}
    .receipt{box-shadow:none;border:1.5px solid #c00;width:100%;max-width:100%}
    .btns{display:none}
  }`;

async function showReceiptById(receiptId, sendWhatsApp, phoneHint) {
  const { data: receipt, error: rErr } = await db.from('dr_receipts').select('*').eq('id', receiptId).single();
  if (rErr || !receipt) { showToast('Could not load receipt', 'error'); return; }

  const { data: donations } = await db.from('dr_donations').select('*').eq('receipt_id', receiptId);
  const { data: ev } = await db.from('dr_events').select('name').eq('id', receipt.event_id).single();
  const { data: memberData } = await db.from('dr_members').select('phone_no').eq('id', receipt.member_id).single();
  const memberPhone = ((phoneHint || memberData?.phone_no || '')).replace(/\D/g, '');

  // Load org for this receipt
  const { data: orgData } = await db.from('dr_organizations').select('*').eq('id', receipt.org_id || currentOrgId).single();
  const org = orgData || currentOrg;
  const templeHeader = buildTempleHeader(org);

  // Resolve head names
  const rows = [];
  let sno = 1;
  for (const d of (donations || [])) {
    let headName = '';
    if (d.head_type === 'general_head' && d.general_head_id) {
      const { data: h } = await db.from('dr_general_heads').select('name').eq('id', d.general_head_id).single();
      headName = h?.name || 'General';
    } else if (d.head_type === 'swapna_item' && d.swapna_item_id) {
      const { data: item } = await db.from('dr_swapna_items').select('name, dr_swapna(name)').eq('id', d.swapna_item_id).single();
      headName = (item?.dr_swapna?.name || 'Swapna') + (item?.name ? ' → ' + item.name : '');
    }
    rows.push({ sno: sno++, headName, amount: parseFloat(d.amount), munQty: d.mun_qty });
  }

  const dt = new Date(receipt.created_at);
  const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const total = parseFloat(receipt.total_amount);
  const isPaid = receipt.is_paid;
  const payMode = receipt.payment_mode;
  const payModeDisplay = { cash: 'રોકડ (Cash)', cheque: 'ચેક (Cheque)', online: 'ઓનલાઇન / UPI', pending: 'બાકી (Pending)' };

  const tableRows = rows.map(r => `
    <tr>
      <td style="text-align:center;color:#888;">${r.sno}</td>
      <td>${r.headName}${r.munQty ? `<br><span style="font-size:10px;color:#888;">${r.munQty} mun</span>` : ''}</td>
      <td>₹ ${r.amount.toLocaleString('en-IN')}</td>
    </tr>`).join('');

  const payInfoHTML = isPaid ? `
    <div class="pay-info">
      <strong>ચૂકવણી પ્રકાર :</strong> ${payModeDisplay[payMode] || payMode}
      ${(payMode === 'cheque' || payMode === 'online') && receipt.bank_name ? `<br><strong>Bank :</strong> ${receipt.bank_name}` : ''}
      ${(payMode === 'cheque' || payMode === 'online') && receipt.utr_no ? `<br><strong>${payMode === 'cheque' ? 'Cheque No.' : 'UTR No.'} :</strong> ${receipt.utr_no}` : ''}
    </div>` : `<div style="text-align:center;margin-bottom:8px;"><span class="pending-badge">⏳ PENDING PAYMENT</span></div>`;

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Receipt – ${receipt.receipt_name} – ${receipt.receipt_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700&display=swap" rel="stylesheet">
<style>${RECEIPT_CSS}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
const MEMBER_PHONE = '${memberPhone}';
const AUTO_SEND = ${sendWhatsApp ? 'true' : 'false'};
const RECEIPT_NO = '${receipt.receipt_no}';

function downloadReceipt() {
  const h = '<!DOCTYPE html>' + document.documentElement.outerHTML;
  const blob = new Blob([h], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Receipt-' + RECEIPT_NO + '.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

let _receiptBlob = null;
async function captureReceiptBlob() {
  try {
    const canvas = await html2canvas(document.querySelector('.receipt'), { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    canvas.toBlob(function(b) { _receiptBlob = b; }, 'image/png');
  } catch(e) {}
}

async function sendWA() {
  const waNum = MEMBER_PHONE.length === 10 ? '91' + MEMBER_PHONE : MEMBER_PHONE;
  const waUrl = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent('🙏 Receipt No. ' + RECEIPT_NO);
  const fileName = 'Receipt-' + RECEIPT_NO + '.png';
  const waBtn = document.getElementById('wa-btn');
  const info = document.getElementById('wa-info');
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  async function tryShare(blob) {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Receipt ' + RECEIPT_NO, text: '🙏 Receipt No. ' + RECEIPT_NO }); return true; }
      catch(e) { if (e.name === 'AbortError') return true; }
    }
    return false;
  }

  function desktopSend(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (info) info.style.display = 'block';
    setTimeout(function() { window.open(waUrl); }, 500);
  }

  if (isMobile) {
    if (_receiptBlob) { await tryShare(_receiptBlob); return; }
    if (waBtn) { waBtn.textContent = '⏳ Preparing...'; waBtn.disabled = true; }
    try {
      const canvas = await html2canvas(document.querySelector('.receipt'), { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      canvas.toBlob(async function(blob) {
        _receiptBlob = blob;
        if (waBtn) { waBtn.textContent = '📲 WhatsApp'; waBtn.disabled = false; }
        if (!await tryShare(blob)) desktopSend(blob);
      }, 'image/png');
    } catch(err) {
      if (waBtn) { waBtn.textContent = '📲 WhatsApp'; waBtn.disabled = false; }
      window.open(waUrl);
    }
    return;
  }

  if (waBtn) { waBtn.textContent = '⏳ Preparing...'; waBtn.disabled = true; }
  try {
    const blob = _receiptBlob ? _receiptBlob : await new Promise(async function(res) {
      const canvas = await html2canvas(document.querySelector('.receipt'), { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      canvas.toBlob(res, 'image/png');
    });
    if (waBtn) { waBtn.textContent = '📲 WhatsApp'; waBtn.disabled = false; }
    desktopSend(blob);
  } catch(err) {
    if (waBtn) { waBtn.textContent = '📲 WhatsApp'; waBtn.disabled = false; }
    window.open(waUrl);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(captureReceiptBlob, 200);
  if (AUTO_SEND) setTimeout(sendWA, 800);
});

function numToGujaratiWords(n) {
  if (!n || n === 0) return 'શૂન્ય';
  const ones = ['','એક','બે','ત્રણ','ચાર','પાંચ','છ','સાત','આઠ','નવ','દસ','અગિયાર','બાર','તેર','ચૌદ','પંદર','સોળ','સત્તર','અઢાર','ઓગણીસ'];
  const tens = ['','','વીસ','ત્રીસ','ચાળીસ','પચાસ','સાઈઠ','સિત્તેર','એંસી','નેવું'];
  function conv(x) {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x/10)] + (x%10?' '+ones[x%10]:'');
    if (x < 1000) return ones[Math.floor(x/100)] + ' સો' + (x%100?' '+conv(x%100):'');
    if (x < 100000) return conv(Math.floor(x/1000)) + ' હજાર' + (x%1000?' '+conv(x%1000):'');
    return conv(Math.floor(x/100000)) + ' લાખ' + (x%100000?' '+conv(x%100000):'');
  }
  return conv(Math.floor(n));
}
</script>
</head>
<body>
<div class="receipt">
  ${templeHeader}
  <div class="receipt-body">
    <div class="receipt-title">
      <span class="rt-label">પહોંચ &nbsp;·&nbsp; RECEIPT</span>
      <span class="rt-no">ન.&nbsp;${receipt.receipt_no}</span>
    </div>
    ${!isPaid ? '<div style="text-align:center;margin-bottom:6px;"><span class="pending-badge">⏳ ચૂકવણી બાકી (PENDING)</span></div>' : ''}
    <div class="meta" style="justify-content:flex-end;"><span>તા. : ${dateStr}</span></div>
    <div class="row"><span class="row-label">નામ :</span><span class="row-value">${receipt.receipt_name}</span></div>
    <div class="row"><span class="row-label">કુટુંબ ક્રમ :</span><span class="row-value">${receipt.family_no || '—'}</span></div>
    <table class="heads-table">
      <thead><tr><th style="width:28px;text-align:center;">ક્ર.</th><th>દાન ની વિગત</th><th>રકમ</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="total-row"><span class="lbl">કુલ (Total)</span><span class="val">₹ ${total.toLocaleString('en-IN')} /-</span></div>
    <div class="words-row">${numToGujaratiWords(total)} રૂપિયા</div>
    ${payInfoHTML}
    ${receipt.notes ? `<div class="row" style="margin-bottom:8px;"><span class="row-label">નોંધ :</span><span class="row-value" style="font-size:11px;">${receipt.notes}</span></div>` : ''}
    <div class="footer">🙏 જય જિનેન્દ્ર 🙏</div>
    <div class="sys-note">આ સ્વ-ઉત્પન્ન (Computer Generated) પહોંચ છે.<br>સહી ની જ઼રૂર નથી. &nbsp;·&nbsp; Signature not required.</div>
  </div>
</div>
<div id="wa-info" style="display:none;background:#e8f5e9;border:1.5px solid #4CAF50;border-radius:8px;padding:10px 14px;margin:8px 0;font-size:12px;color:#1b5e20;text-align:center;line-height:1.6;">
  ✅ Receipt PNG downloaded. WhatsApp opened.<br>In WhatsApp: tap 📎 Attach → select PNG → Send.
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print (A6)</button>
  <button class="btn btn-dl" onclick="downloadReceipt()">⬇ Download HTML</button>
  <button id="wa-btn" class="btn btn-wa" onclick="sendWA()">📲 WhatsApp</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=430,height=800,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view receipt', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

async function showDonationReceipt(donationId) {
  const { data: d, error } = await db.from('dr_donations').select('*').eq('id', donationId).single();
  if (error || !d) { showToast('Could not load donation', 'error'); return; }
  if (!d.received_amount || parseFloat(d.received_amount) <= 0) {
    showToast('Enter the received amount first — receipt is only generated once payment is confirmed', 'error');
    return;
  }
  if (d.receipt_id) { await showReceiptById(d.receipt_id, false); return; }

  const { data: org } = await db.from('dr_organizations').select('*').eq('id', d.org_id || currentOrgId).single();
  const templeHeader = buildTempleHeader(org);

  let headName = '', itemName = '';
  if (d.head_type === 'general_head' && d.general_head_id) {
    const { data: h } = await db.from('dr_general_heads').select('name').eq('id', d.general_head_id).single();
    headName = h?.name || '';
  } else if (d.head_type === 'swapna_item' && d.swapna_item_id) {
    const { data: item } = await db.from('dr_swapna_items').select('name, dr_swapna(name)').eq('id', d.swapna_item_id).single();
    headName = item?.dr_swapna?.name || 'Swapna';
    itemName = item?.name || '';
  }

  const dt = new Date(d.created_at);
  const receiptDate = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const receiptNo = 'DB-' + dt.getFullYear() + '-' + String(d.id || '').slice(-6).padStart(6, '0');
  const total = parseFloat(d.amount);

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Receipt – ${d.donor_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700&display=swap" rel="stylesheet">
<style>${RECEIPT_CSS}</style>
</head>
<body>
<div class="receipt">
  ${templeHeader}
  <div class="receipt-body">
    <div class="receipt-title">પહોંચ &nbsp;·&nbsp; RECEIPT</div>
    <div class="meta"><span>ન. : ${receiptNo}</span><span>તા. : ${receiptDate}</span></div>
    <div class="row"><span class="row-label">નામ :</span><span class="row-value">${d.receipt_name || d.donor_name}</span></div>
    ${d.is_split_row ? '' : `<div class="row"><span class="row-label">કુટુંબ ક્રમ :</span><span class="row-value">${d.family_no || '—'}</span></div>`}
    <table class="heads-table">
      <thead><tr><th style="width:28px;text-align:center;">ક્ર.</th><th>દાન ની વિગત</th><th>રકમ</th></tr></thead>
      <tbody><tr><td style="text-align:center;color:#888;">1</td><td>${headName}${itemName ? ' → ' + itemName : ''}${d.mun_qty ? `<br><span style="font-size:10px;color:#888;">${d.mun_qty} mun</span>` : ''}</td><td>₹ ${total.toLocaleString('en-IN')}</td></tr></tbody>
    </table>
    <div class="total-row"><span class="lbl">કુલ (Total)</span><span class="val">₹ ${total.toLocaleString('en-IN')} /-</span></div>
    <div class="words-row">${numToGujaratiWords(total)} રૂપિયા</div>
    <div class="footer">🙏 જય જિનેન્દ્ર 🙏</div>
    <div class="sys-note">આ સ્વ-ઉત્પન્ન (Computer Generated) પહોંચ છે.<br>સહી ની જ઼રૂર નથી. &nbsp;·&nbsp; Signature not required.</div>
  </div>
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print / PDF</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=430,height=720,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view receipt', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

// Deliberately minimal, no org name/phone/head-detail — just Offer Accepted,
// Name, Amount, Code No. Printed as two identical copies on one A5 sheet so
// staff can tear it in half: one part to the donor, one part retained &
// manually stamped as the office copy.
async function showTokenSlip(tokenId) {
  const { data: t, error } = await db.from('dr_receipt_tokens').select('id, payer_name, total_amount, created_at').eq('id', tokenId).single();
  if (error || !t) { showToast('Could not load token', 'error'); return; }

  const dt = new Date(t.created_at);
  const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const code = 'TKN-' + dt.getFullYear() + '-' + String(t.id || '').slice(-6).padStart(6, '0');
  const amountStr = parseFloat(t.total_amount).toLocaleString('en-IN');

  const slipBlock = (label) => `
    <div class="slip">
      <div class="slip-label">${label}</div>
      <div class="slip-title">OFFER ACCEPTED</div>
      <div class="slip-row"><span>Name</span><span>${t.payer_name}</span></div>
      <div class="slip-row"><span>Amount</span><span>₹ ${amountStr}</span></div>
      <div class="slip-row"><span>Code No.</span><span>${code}</span></div>
      <div class="slip-row"><span>Date</span><span>${dateStr}</span></div>
      <div class="slip-stamp">Stamp / Sign</div>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${code}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}
  body{background:#eee;display:flex;flex-direction:column;align-items:center;padding:16px;gap:12px;}
  .page{background:#fff;width:396px;border:1px solid #ccc;}
  .slip{padding:16px;border-bottom:2px dashed #999;position:relative;}
  .slip:last-child{border-bottom:none;}
  .slip-label{font-size:10px;color:#888;text-align:right;margin-bottom:4px;}
  .slip-title{font-size:15px;font-weight:700;text-align:center;letter-spacing:1px;margin-bottom:10px;}
  .slip-row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid #eee;}
  .slip-row span:first-child{color:#555;}
  .slip-row span:last-child{font-weight:700;}
  .slip-stamp{margin-top:14px;height:40px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;}
  .btns{display:flex;gap:8px;}
  .btn{padding:10px 18px;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;font-family:inherit;}
  .btn-print{background:#333;color:#fff;}
  .btn-close{background:#e8e8e8;color:#333;}
  @media print{
    @page{size:A5;margin:6mm;}
    body{background:#fff;padding:0;}
    .page{border:none;width:100%;}
    .btns{display:none;}
  }
</style>
</head>
<body>
<div class="page">
  ${slipBlock('Donor Copy')}
  ${slipBlock('Office Copy')}
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print (A5, 2 copies)</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=430,height=720,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view slip', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

function numToGujaratiWords(n) {
  if (!n || n === 0) return 'શૂન્ય';
  const ones = ['', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ', 'છ', 'સાત', 'આઠ', 'નવ',
    'દસ', 'અગિયાર', 'બાર', 'તેર', 'ચૌદ', 'પંદર', 'સોળ', 'સત્તર', 'અઢાર', 'ઓગણીસ'];
  const tens = ['', '', 'વીસ', 'ત્રીસ', 'ચાળીસ', 'પચાસ', 'સાઈઠ', 'સિત્તેર', 'એંસી', 'નેવું'];
  function conv(x) {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    if (x < 1000) return ones[Math.floor(x / 100)] + ' સો' + (x % 100 ? ' ' + conv(x % 100) : '');
    if (x < 100000) return conv(Math.floor(x / 1000)) + ' હજાર' + (x % 1000 ? ' ' + conv(x % 1000) : '');
    return conv(Math.floor(x / 100000)) + ' લાખ' + (x % 100000 ? ' ' + conv(x % 100000) : '');
  }
  return conv(Math.floor(n));
}
