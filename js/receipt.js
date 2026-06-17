// ==========================================
// DERASAR BOLI - Gujarati Receipt Generator
// ==========================================

async function showDonationReceipt(donationId) {
  const { data: d, error } = await db.from('donations').select('*').eq('id', donationId).single();
  if (error || !d) { showToast('Could not load donation', 'error'); return; }

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

  const headingBlock = `
    <div class="org-header">
      <div class="org-namah">|| શ્રી શંખેશ્વર પાર્શ્વનાથ નમઃ ||</div>
      <div class="org-name">શ્રી શાંતિલાલ કેશવલાલ શાહ ગોત્રી રોડ<br>શ્વેતાંબર મૂર્તિપૂજક જૈન સંઘ</div>
      <div class="org-addr">"શાંતિનિકેતન", ૨૫-એ, હરિનગર સોસાયટી,<br>ગોત્રી રોડ, વડોદરા - ૩૯૦ ૦૦૭.</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Receipt – ${d.donor_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hind Vadodara','Noto Sans Gujarati',Arial,sans-serif;background:#f0ece4;display:flex;flex-direction:column;align-items:center;padding:24px;gap:16px;min-height:100vh}
  .receipt{background:#fff;width:340px;border:3px solid #c00;border-radius:4px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.18)}
  /* Temple heading - matches printed receipt style */
  .org-header{border-bottom:2px solid #c00;padding:10px 12px;text-align:center;background:#fff}
  .org-namah{font-size:12px;color:#555;margin-bottom:4px}
  .org-name{font-size:15px;font-weight:700;color:#c00;line-height:1.35;margin-bottom:4px}
  .org-addr{font-size:11px;color:#444;line-height:1.4}
  /* Receipt body */
  .receipt-body{padding:14px}
  .receipt-title{text-align:center;font-size:13px;font-weight:700;color:#c00;letter-spacing:3px;border:1.5px solid #c00;padding:4px;margin-bottom:10px}
  .dashed{border:none;border-top:1px dashed #c00;margin:10px 0}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:10px}
  /* Row layout matching printed receipt */
  .row{display:flex;border-bottom:1px solid #e0c0c0;padding:5px 0;align-items:flex-start;font-size:13px}
  .row-label{color:#555;width:110px;flex-shrink:0;font-size:12px}
  .row-value{font-weight:600;color:#1a1a1a;flex:1}
  .row-amount{font-weight:700;color:#c00;text-align:right;min-width:80px}
  /* Amount box */
  .amount-box{background:#c00;color:#fff;padding:12px;text-align:center;margin:12px 0;border-radius:4px}
  .amt-label{font-size:11px;opacity:.8;margin-bottom:3px}
  .amt-value{font-size:28px;font-weight:700;line-height:1}
  .amt-words{font-size:11px;opacity:.85;margin-top:4px;font-style:italic}
  /* Signature row */
  .sig-row{display:flex;justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid #e0c0c0}
  .sig-box{text-align:center;font-size:10px;color:#888}
  .sig-line{width:100px;border-top:1px solid #555;margin:16px auto 4px}
  /* Footer */
  .footer{text-align:center;color:#c00;font-weight:700;font-size:13px;padding:8px 0 4px}
  /* Print buttons */
  .btns{display:flex;gap:10px}
  .btn{padding:11px 24px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600}
  .btn-print{background:#c00;color:#fff}
  .btn-close{background:#e8e8e8;color:#333}
  @media print{
    body{background:#fff;padding:0}
    .receipt{box-shadow:none;border:2px solid #c00;width:100%}
    .btns{display:none}
  }
</style>
</head>
<body>
<div class="receipt">
  ${headingBlock}
  <div class="receipt-body">
    <div class="receipt-title">પહોંચ &nbsp;·&nbsp; RECEIPT</div>
    <div class="meta">
      <span>ન. : ${receiptNo}</span>
      <span>તા. : ${receiptDate}</span>
    </div>
    <div class="row">
      <span class="row-label">નામ :</span>
      <span class="row-value">${d.donor_name}</span>
    </div>
    <div class="row">
      <span class="row-label">કુટુંબ ક્રમ :</span>
      <span class="row-value">${d.family_no || '—'}</span>
    </div>
    <div class="row">
      <span class="row-label">ઉત્સવ :</span>
      <span class="row-value">${ev?.name || '—'}</span>
    </div>
    <div class="row">
      <span class="row-label">વિગત :</span>
      <span class="row-value">${headName}${itemName ? ' → ' + itemName : ''}</span>
    </div>
    ${d.note ? `<div class="row"><span class="row-label">નોંધ :</span><span class="row-value" style="font-size:12px">${d.note}</span></div>` : ''}
    <div class="amount-box">
      <div class="amt-label">દાન રાશિ (Donation Amount)</div>
      <div class="amt-value">₹ ${Number(d.amount).toLocaleString('en-IN')} /-</div>
      <div class="amt-words">${numToGujaratiWords(parseFloat(d.amount))} રૂપિયા</div>
    </div>
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line"></div>નાણાં આપનારની સહી</div>
      <div class="sig-box"><div class="sig-line"></div>નાણાં લેનારની સહી</div>
    </div>
    <div class="footer">🙏 જય જિનેન્દ્ર 🙏</div>
  </div>
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=720,scrollbars=yes');
  if (!win) { showToast('Please allow pop-ups to view receipt', 'error'); return; }
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
