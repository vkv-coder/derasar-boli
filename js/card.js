// ==========================================
// DERASAR BOLI - Membership Card
// ==========================================
// Reuses receipt.js's RECEIPT_CSS/buildTempleHeader for consistent
// branding. Card's QR encodes a deep link (?family=<no>) back into this
// app — scanning it while logged in as admin jumps straight to that
// family's outstanding-donations view (js/donors.js: showFamilyOutstanding)
// so payment can be looked up and registered on the spot. No public/
// unauthenticated access — same RLS as everything else in the app.

async function showMembershipCard(familyNo) {
  const { data: org } = await db.from('dr_organizations').select('*').eq('id', currentOrgId).single();
  const { data: members, error } = await db.from('dr_members')
    .select('*').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });
  if (error || !members || members.length === 0) { showToast('Could not load family members', 'error'); return; }

  const head = members.find(m => m.is_head) || members[0];
  const others = members.filter(m => m.id !== head.id);
  const templeHeader = buildTempleHeader(org);
  const cardUrl = window.location.origin + window.location.pathname + '?family=' + encodeURIComponent(familyNo);

  const html = `<!DOCTYPE html>
<html lang="gu">
<head>
<meta charset="UTF-8"/>
<title>Membership Card – ${head.person_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Vadodara:wght@400;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<style>${RECEIPT_CSS}
  .card-id{font-size:12px;color:#888;text-align:center;margin-bottom:10px;font-weight:600;}
  .members-box{margin:10px 0;padding:8px 0;border-top:1px dashed #e0c0c0;border-bottom:1px dashed #e0c0c0;}
  .head-name{font-weight:800;color:#c00;font-size:16px;margin-bottom:6px;}
  .other-name{font-size:13px;padding:3px 0 3px 8px;color:#333;}
  #qr-canvas{display:block;margin:12px auto 4px;}
  .qr-note{text-align:center;font-size:10px;color:#999;}
</style>
</head>
<body>
<div class="receipt">
  ${templeHeader}
  <div class="receipt-body">
    <div class="receipt-title"><span class="rt-label">MEMBERSHIP CARD</span></div>
    <div class="card-id">Family No: ${familyNo}</div>
    <div class="members-box">
      <div class="head-name">🙏 ${head.person_name}</div>
      ${others.map(m => `<div class="other-name">${m.person_name}</div>`).join('')}
    </div>
    <canvas id="qr-canvas"></canvas>
    <div class="qr-note">For office use — scan to look up account</div>
    <div class="footer" style="margin-top:10px;">🙏 જય જિનેન્દ્ર 🙏</div>
  </div>
</div>
<div class="btns">
  <button class="btn btn-print" onclick="window.print()">🖨 Print</button>
  <button class="btn btn-dl" id="card-wa-btn" onclick="sendCardWA()">📲 WhatsApp</button>
  <button class="btn btn-close" onclick="window.close()">Close</button>
</div>
<script>
  var CARD_URL = ${JSON.stringify(cardUrl)};
  var HEAD_NAME = ${JSON.stringify(head.person_name)};
  QRCode.toCanvas(document.getElementById('qr-canvas'), CARD_URL, { width: 140, margin: 1 }, function(err) {});

  function sendCardWA() {
    var btn = document.getElementById('card-wa-btn');
    btn.textContent = '⏳ Preparing...'; btn.disabled = true;
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = function() {
      html2canvas(document.querySelector('.receipt'), { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
        .then(function(canvas) {
          canvas.toBlob(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'MembershipCard-' + HEAD_NAME.replace(/\\s+/g,'_') + '.png';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.textContent = '📲 WhatsApp'; btn.disabled = false;
            window.open('https://wa.me/?text=' + encodeURIComponent('🙏 Membership Card - ' + HEAD_NAME));
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
