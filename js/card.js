// ==========================================
// DERASAR BOLI - Membership Card (visiting-card size)
// ==========================================
// Prints as an actual 3.5in x 2in visiting card (2 sides): front carries
// temple name + head-of-family name + QR deep-link (?family=<no>), back
// lists every family member (fits up to 9+ via 2-column layout). QR opens
// this app's family-outstanding view (js/donors.js: showFamilyOutstanding)
// when scanned by a logged-in admin — no public/unauthenticated access.

function formatFamilyCode(no) {
  if (!no) return '';
  const m = String(no).match(/^([A-Za-z]+)[\s-]?(\d+)$/);
  return m ? (m[1].toUpperCase() + '-' + m[2]) : String(no);
}

async function showMembershipCard(familyNo) {
  const { data: org } = await db.from('dr_organizations').select('*').eq('id', currentOrgId).single();
  const { data: members, error } = await db.from('dr_members')
    .select('*').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });
  if (error || !members || members.length === 0) { showToast('Could not load family members', 'error'); return; }

  const head = members.find(m => m.is_head) || members[0];
  const others = members.filter(m => m.id !== head.id);
  const orgName = (org && org.name) || 'Derasar Boli';
  const familyCode = formatFamilyCode(familyNo);
  const logoUrl = window.location.origin + '/jin-pratik.jpg';
  const cardUrl = window.location.origin + window.location.pathname + '?family=' + encodeURIComponent(familyNo);

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Membership Card – ${head.person_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hind Vadodara','Noto Sans Gujarati',Arial,sans-serif;background:#f0ece4;display:flex;flex-direction:column;align-items:center;padding:20px;gap:16px;min-height:100vh}
  #card-capture{display:flex;flex-direction:column;gap:14px;align-items:center}
  .vcard{width:3.5in;height:2in;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.15);position:relative;overflow:hidden}
  .vc-front{display:flex;height:100%}
  .vc-logo-wrap{width:34%;flex-shrink:0;background:#fff8ec;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4px 2px}
  .vc-logo-wrap img{width:100%;height:100%;object-fit:contain;object-position:center}
  .vc-front-mid{flex:1;min-width:0;padding:8px 8px;display:flex;flex-direction:column;justify-content:center}
  .vc-temple{font-size:11.5px;font-weight:800;color:#c00;line-height:1.25;margin-bottom:5px}
  .vc-id-big{font-size:25px;font-weight:900;color:#7B1C1C;line-height:1;margin-bottom:6px;letter-spacing:0.5px}
  .vc-head{font-size:14px;font-weight:800;color:#1450c9;line-height:1.25;word-break:break-word;margin-bottom:2px}
  .vc-member-count{font-size:10.5px;color:#666;font-weight:700}
  .vc-front-right{width:64px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px}
  #qr-canvas{width:56px !important;height:56px !important;display:block;margin:0 auto}
  .vc-qr-note{font-size:6px;color:#aaa;margin-top:3px;line-height:1.3;text-align:center}
  .vc-back{display:flex;flex-direction:column;height:100%}
  .vc-back-title{font-size:9.5px;font-weight:800;color:#c00;border-bottom:1.5px solid #c00;padding-bottom:4px;margin-bottom:5px;display:flex;justify-content:space-between}
  .vc-list{columns:2;column-gap:12px;flex:1;font-size:9px;line-height:1.65}
  .vc-item{break-inside:avoid;color:#333}
  .vc-item.is-head{font-weight:800;color:#c00}
  .vc-back-foot{font-size:7px;color:#aaa;text-align:center;margin-top:4px}
  .card-label{font-size:10px;color:#888;font-weight:600;text-align:center}
  .btns{display:flex;gap:8px;margin-top:4px}
  .btn{border:none;border-radius:6px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}
  .btn-print{background:#333;color:#fff}
  .btn-dl{background:#25D366;color:#fff}
  .btn-close{background:#eee;color:#333}
  #wa-info{display:none;background:#e8f5e9;border:1.5px solid #4CAF50;border-radius:8px;padding:10px 14px;margin:4px 0;font-size:12px;color:#1b5e20;text-align:center;line-height:1.6;max-width:340px}
  @media print{
    @page{size:3.5in 2in;margin:0}
    body{padding:0;background:#fff;gap:0}
    .no-print{display:none !important}
    #card-capture{gap:0}
    .vcard{box-shadow:none;border:none;border-radius:0;page-break-after:always}
    .card-label{display:none}
  }
</style>
</head>
<body>
<div id="card-capture">
  <div class="card-label no-print">FRONT</div>
  <div class="vcard" id="vc-front">
    <div class="vc-front">
      <div class="vc-logo-wrap">
        <img src="${logoUrl}" alt="">
      </div>
      <div class="vc-front-mid">
        <div class="vc-temple">${orgName}</div>
        <div class="vc-id-big">${familyCode}</div>
        <div class="vc-head">${head.person_name}</div>
        <div class="vc-member-count">Member (${members.length})</div>
      </div>
      <div class="vc-front-right">
        <canvas id="qr-canvas"></canvas>
        <div class="vc-qr-note">Office use —<br>scan to view a/c</div>
      </div>
    </div>
  </div>
  <div class="card-label no-print">BACK</div>
  <div class="vcard" id="vc-back">
    <div class="vc-back">
      <div class="vc-back-title"><span>FAMILY MEMBERS</span><span>${members.length}</span></div>
      <div class="vc-list">
        <div class="vc-item is-head">🙏 ${head.person_name}</div>
        ${others.map(m => `<div class="vc-item">${m.person_name}</div>`).join('')}
      </div>
      <div class="vc-back-foot">${orgName}</div>
    </div>
  </div>
</div>
<div id="wa-info" class="no-print">
  ✅ Card PNG downloaded (front + back).<br>In WhatsApp: tap 📎 Attach → select PNG → Send.
</div>
<div class="btns no-print">
  <button class="btn btn-print" onclick="window.print()">🖨 Print</button>
  <button class="btn btn-dl" id="card-wa-btn" onclick="sendCardWA()">📲 WhatsApp</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
<script>
  var CARD_URL = ${JSON.stringify(cardUrl)};
  var HEAD_NAME = ${JSON.stringify(head.person_name)};
  var HEAD_PHONE = ${JSON.stringify((head.phone_no || '').replace(/\D/g, ''))};
  QRCode.toCanvas(document.getElementById('qr-canvas'), CARD_URL, { width: 140, margin: 1 }, function(err) {});

  function sendCardWA() {
    var waNum = HEAD_PHONE.length === 10 ? '91' + HEAD_PHONE : HEAD_PHONE;
    var waUrl = waNum
      ? 'https://wa.me/' + waNum + '?text=' + encodeURIComponent('🙏 Membership Card - ' + HEAD_NAME)
      : 'https://wa.me/?text=' + encodeURIComponent('🙏 Membership Card - ' + HEAD_NAME);
    var fileName = 'MembershipCard-' + HEAD_NAME.replace(/\s+/g, '_') + '.png';

    var btn = document.getElementById('card-wa-btn');
    btn.textContent = '⏳ Preparing...'; btn.disabled = true;
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = function() {
      html2canvas(document.getElementById('card-capture'), { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' })
        .then(function(canvas) {
          canvas.toBlob(function(blob) {
            var file = new File([blob], fileName, { type: 'image/png' });

            // Mobile: native share sheet attaches the image directly —
            // pick WhatsApp there, no separate download+attach step, and
            // no risk of the download getting cut off by the app-switch.
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              navigator.share({ files: [file], text: '🙏 Membership Card - ' + HEAD_NAME })
                .then(function() { btn.textContent = '📲 WhatsApp'; btn.disabled = false; })
                .catch(function() { btn.textContent = '📲 WhatsApp'; btn.disabled = false; });
              return;
            }

            // Desktop fallback: download PNG, open WhatsApp targeted at
            // the number, user attaches manually (wa.me can't pre-attach).
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.textContent = '📲 WhatsApp'; btn.disabled = false;
            document.getElementById('wa-info').style.display = 'block';
            window.open(waUrl);
          }, 'image/png');
        });
    };
    document.head.appendChild(s);
  }
</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=430,height=760,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view card', 'error'); return; }
  win.document.write(html);
  win.document.close();
}
