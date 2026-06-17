// ==========================================
// DERASAR BOLI - Receipt Generator (v2)
// Supports multi-head receipts via receipts table
// ==========================================

const TEMPLE_HEADER = `
  <div class="org-header">
    <div class="org-namah">|| શ્રી શંખેશ્વર પાર્શ્વનાથ નમઃ ||</div>
    <div class="org-name">શ્રી શાંતિલાલ કેશવલાલ શાહ ગોત્રી રોડ<br>શ્વેતાંબર મૂર્તિપૂજક જૈન સંઘ</div>
    <div class="org-addr">"શાંતિનિકેતન", ૨૫-એ, હરિનગર સોસાયટી,<br>ગોત્રી રોડ, વડોદરા - ૩૯૦ ૦૦૭.</div>
    <div class="org-reg">PAN : AAFTS8878E &nbsp;|&nbsp; Public Trust Reg. A/3024/Vadodara, dt. 02-08-2004</div>
  </div>`;

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
  .receipt-title{text-align:center;font-size:13px;font-weight:700;color:#c00;letter-spacing:3px;border:1.5px solid #c00;padding:4px;margin-bottom:10px}
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
  .sig-row{display:flex;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid #e0c0c0}
  .sig-box{text-align:center;font-size:10px;color:#888}
  .sig-line{width:100px;border-top:1px solid #555;margin:16px auto 4px}
  .footer{text-align:center;color:#c00;font-weight:700;font-size:13px;padding:8px 0 4px}
  .btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  .btn{padding:11px 22px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600}
  .btn-print{background:#c00;color:#fff}
  .btn-wa{background:#25D366;color:#fff}
  .btn-close{background:#e8e8e8;color:#333}
  .pending-badge{display:inline-block;background:#ff9800;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-bottom:6px}
  @media print{
    body{background:#fff;padding:0}
    .receipt{box-shadow:none;border:2px solid #c00;width:100%}
    .btns{display:none}
  }`;

// ─── MULTI-HEAD RECEIPT (via receipts table) ──────────────────────────────────
async function showReceiptById(receiptId, sendWhatsApp) {
  const { data: receipt, error: rErr } = await db.from('receipts').select('*').eq('id', receiptId).single();
  if (rErr || !receipt) { showToast('Could not load receipt', 'error'); return; }

  const { data: donations } = await db.from('donations').select('*').eq('receipt_id', receiptId);
  const { data: ev } = await db.from('events').select('name').eq('id', receipt.event_id).single();

  // Resolve head names
  const rows = [];
  let sno = 1;
  for (const d of (donations || [])) {
    let headName = '';
    if (d.head_type === 'general_head' && d.general_head_id) {
      const { data: h } = await db.from('general_heads').select('name').eq('id', d.general_head_id).single();
      headName = h?.name || 'General';
    } else if (d.head_type === 'swapna_item' && d.swapna_item_id) {
      const { data: item } = await db.from('swapna_items').select('name, swapna(name)').eq('id', d.swapna_item_id).single();
      headName = (item?.swapna?.name || 'Swapna') + (item?.name ? ' → ' + item.name : '');
    }
    rows.push({ sno: sno++, headName, amount: parseFloat(d.amount) });
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
      <td>${r.headName}</td>
      <td>₹ ${r.amount.toLocaleString('en-IN')}</td>
    </tr>`).join('');

  const payInfoHTML = isPaid ? `
    <div class="pay-info">
      <strong>ચૂકવણી પ્રકાર :</strong> ${payModeDisplay[payMode] || payMode}
      ${(payMode === 'cheque' || payMode === 'online') && receipt.bank_name
        ? `<br><strong>Bank :</strong> ${receipt.bank_name}` : ''}
      ${(payMode === 'cheque' || payMode === 'online') && receipt.utr_no
        ? `<br><strong>${payMode === 'cheque' ? 'Cheque No.' : 'UTR No.'} :</strong> ${receipt.utr_no}` : ''}
    </div>` : `<div style="text-align:center;margin-bottom:8px;"><span class="pending-badge">⏳ PENDING PAYMENT</span></div>`;

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Receipt – ${receipt.receipt_name} – ${receipt.receipt_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700&display=swap" rel="stylesheet">
<style>${RECEIPT_CSS}</style>
<script>
function sendWA() {
  const txt = "🙏 *Derasar Boli Receipt*\\n"
    + "Receipt No: ${receipt.receipt_no}\\n"
    + "Date: ${dateStr}\\n"
    + "Name: ${receipt.receipt_name}\\n"
    + "Event: ${ev?.name || ''}\\n"
    + "${rows.map(r => r.sno + '. ' + r.headName + ': ₹' + r.amount.toLocaleString('en-IN')).join('\\n')}\\n"
    + "Total: ₹${total.toLocaleString('en-IN')} (${numToGujaratiWords(total)} રૂપિયા)\\n"
    + "${isPaid ? 'Payment: ' + (payModeDisplay[payMode] || payMode) : 'Payment: PENDING'}\\n"
    + "🙏 જય જિનેન્દ્ર 🙏";
  window.open('https://wa.me/?text=' + encodeURIComponent(txt));
}
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
  ${TEMPLE_HEADER}
  <div class="receipt-body">
    <div class="receipt-title">પહોંચ &nbsp;·&nbsp; RECEIPT</div>
    ${!isPaid ? '<div style="text-align:center;margin-bottom:6px;"><span class="pending-badge">⏳ ચૂકવણી બાકી (PENDING)</span></div>' : ''}
    <div class="meta">
      <span>ન. : <strong>${receipt.receipt_no}</strong></span>
      <span>તા. : ${dateStr}</span>
    </div>
    <div class="row">
      <span class="row-label">નામ :</span>
      <span class="row-value">${receipt.receipt_name}</span>
    </div>
    <div class="row">
      <span class="row-label">કુટુંબ ક્રમ :</span>
      <span class="row-value">${receipt.family_no || '—'}</span>
    </div>
    <div class="row">
      <span class="row-label">ઉત્સવ :</span>
      <span class="row-value">${ev?.name || '—'}</span>
    </div>

    <table class="heads-table">
      <thead>
        <tr>
          <th style="width:28px;text-align:center;">ક્ર.</th>
          <th>દાન ની વિગત</th>
          <th>રકમ</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div class="total-row">
      <span class="lbl">કુલ (Total)</span>
      <span class="val">₹ ${total.toLocaleString('en-IN')} /-</span>
    </div>
    <div class="words-row">${numToGujaratiWords(total)} રૂપિયા</div>

    ${payInfoHTML}

    ${receipt.notes ? `<div class="row" style="margin-bottom:8px;"><span class="row-label">નોંધ :</span><span class="row-value" style="font-size:11px;">${receipt.notes}</span></div>` : ''}

    <div class="sig-row">
      <div class="sig-box"><div class="sig-line"></div>નાણાં આપનારની સહી</div>
      <div class="sig-box"><div class="sig-line"></div>નાણાં લેનારની સહી</div>
    </div>
    <div class="footer">🙏 જય જિનેન્દ્ર 🙏</div>
  </div>
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print / PDF</button>
  <button class="btn btn-wa" onclick="sendWA()">📲 WhatsApp</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=430,height=780,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view receipt', 'error'); return; }
  win.document.write(html);
  win.document.close();

  if (sendWhatsApp) {
    const txt = '🙏 *Derasar Boli Receipt*\n'
      + 'Receipt No: ' + receipt.receipt_no + '\n'
      + 'Date: ' + dateStr + '\n'
      + 'Name: ' + receipt.receipt_name + '\n'
      + 'Event: ' + (ev?.name || '') + '\n'
      + rows.map(r => r.sno + '. ' + r.headName + ': ₹' + r.amount.toLocaleString('en-IN')).join('\n') + '\n'
      + 'Total: ₹' + total.toLocaleString('en-IN') + ' (' + numToGujaratiWords(total) + ' રૂપિયા)\n'
      + (isPaid ? 'Payment: ' + (payModeDisplay[payMode] || payMode) : 'Payment: PENDING') + '\n'
      + '🙏 જય જિનેન્દ્ર 🙏';
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
}

// ─── SINGLE-DONATION RECEIPT (backward compat) ────────────────────────────────
async function showDonationReceipt(donationId) {
  const { data: d, error } = await db.from('donations').select('*').eq('id', donationId).single();
  if (error || !d) { showToast('Could not load donation', 'error'); return; }
  // If this donation belongs to a receipts-table record, use the new format
  if (d.receipt_id) { await showReceiptById(d.receipt_id, false); return; }

  const { data: ev } = await db.from('events').select('name').eq('id', d.event_id).single();
  let headName = '', itemName = '';
  if (d.head_type === 'general_head' && d.general_head_id) {
    const { data: h } = await db.from('general_heads').select('name').eq('id', d.general_head_id).single();
    headName = h?.name || '';
  } else if (d.head_type === 'swapna_item' && d.swapna_item_id) {
    const { data: item } = await db.from('swapna_items').select('name, swapna(name)').eq('id', d.swapna_item_id).single();
    headName = item?.swapna?.name || 'Swapna';
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
  ${TEMPLE_HEADER}
  <div class="receipt-body">
    <div class="receipt-title">પહોંચ &nbsp;·&nbsp; RECEIPT</div>
    <div class="meta"><span>ન. : ${receiptNo}</span><span>તા. : ${receiptDate}</span></div>
    <div class="row"><span class="row-label">નામ :</span><span class="row-value">${d.donor_name}</span></div>
    <div class="row"><span class="row-label">કુટુંબ ક્રમ :</span><span class="row-value">${d.family_no || '—'}</span></div>
    <div class="row"><span class="row-label">ઉત્સવ :</span><span class="row-value">${ev?.name || '—'}</span></div>
    <div class="row"><span class="row-label">વિગત :</span><span class="row-value">${headName}${itemName ? ' → ' + itemName : ''}</span></div>
    ${d.note ? `<div class="row"><span class="row-label">નોંધ :</span><span class="row-value" style="font-size:11px">${d.note}</span></div>` : ''}
    <table class="heads-table">
      <thead><tr><th style="width:28px;text-align:center;">ક્ર.</th><th>દાન ની વિગત</th><th>રકમ</th></tr></thead>
      <tbody><tr><td style="text-align:center;color:#888;">1</td><td>${headName}${itemName ? ' → ' + itemName : ''}</td><td>₹ ${total.toLocaleString('en-IN')}</td></tr></tbody>
    </table>
    <div class="total-row"><span class="lbl">કુલ (Total)</span><span class="val">₹ ${total.toLocaleString('en-IN')} /-</span></div>
    <div class="words-row">${numToGujaratiWords(total)} રૂપિયા</div>
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line"></div>નાણાં આપનારની સહી</div>
      <div class="sig-box"><div class="sig-line"></div>નાણાં લેનારની સહી</div>
    </div>
    <div class="footer">🙏 જય જિનેન્દ્ર 🙏</div>
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

// ─── NUMBER → GUJARATI WORDS ──────────────────────────────────────────────────
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
