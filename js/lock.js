// ==========================================
// DERASAR BOLI - Entry Lock
// ==========================================
// Freezes past entries against correction once an admin "closes" them via
// a movable lock date (dr_organizations.locked_through_date) - anything
// dated on or before that date can no longer be edited/voided/have its
// payment mode changed by a regular admin. One flagged profile
// (dr_profiles.can_override_lock) is exempt entirely, for the rare real
// correction a locked entry still needs.
//
// This is checked client-side here for a clear message, AND enforced for
// real server-side via RESTRICTIVE RLS policies + a trigger (see
// supabase-entry-lock.sql) - a regular admin bypassing this file via
// devtools still can't actually write to a locked row.

function canOverrideLock() {
  return !!(currentProfile && currentProfile.can_override_lock);
}

async function getLockedThroughDate() {
  const { data } = await db.from('dr_organizations').select('locked_through_date').eq('id', currentOrgId).single();
  return data?.locked_through_date || null;
}

// dateStr can be a full ISO timestamp or a plain date - only the date part matters.
async function isDateLocked(dateStr) {
  if (!dateStr) return false;
  const lockedThrough = await getLockedThroughDate();
  if (!lockedThrough) return false;
  return dateStr.slice(0, 10) <= lockedThrough;
}

// Call before any edit/void/cancel touching an existing dated entry. Shows
// a toast and returns true (blocked) if locked and the caller can't
// override; returns false (proceed) otherwise.
async function guardLockedEdit(dateStr) {
  if (canOverrideLock()) return false;
  if (await isDateLocked(dateStr)) {
    showToast('This entry is locked (dated on/before the lock date). Ask an authorized admin to correct it.', 'error');
    return true;
  }
  return false;
}

async function loadLockControlSection() {
  const el = document.getElementById('lock-control-container');
  if (!el) return;
  const lockedThrough = await getLockedThroughDate();
  if (!canOverrideLock()) {
    el.innerHTML = lockedThrough
      ? `<p style="font-size:13px;">🔒 Entries locked through <strong>${new Date(lockedThrough).toLocaleDateString('en-IN')}</strong>. Contact an authorized admin for corrections before this date.</p>`
      : `<p style="font-size:13px;color:var(--text-muted);">No lock date set — all entries are currently editable.</p>`;
    return;
  }
  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div class="form-group" style="margin-bottom:0;">
        <label>Lock entries through (inclusive)</label>
        <input type="date" id="lock-through-date" value="${lockedThrough || ''}" />
      </div>
      <button class="btn-primary btn-sm" onclick="setLockedThroughDate()">🔒 Set Lock Date</button>
      ${lockedThrough ? `<button class="btn-sm btn-secondary" onclick="clearLockedThroughDate()">Clear Lock</button>` : ''}
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">Entries dated on or before this date can no longer be edited, voided, or have payment mode changed by regular admins. You're seeing this control because your login is authorized to manage the lock.</p>
  `;
}

async function setLockedThroughDate() {
  const val = document.getElementById('lock-through-date')?.value;
  if (!val) { showToast('Pick a date first', 'error'); return; }
  if (!confirm(`Lock all entries dated on or before ${val}? Regular admins won't be able to edit/void/change them afterward.`)) return;
  const { error } = await db.from('dr_organizations').update({ locked_through_date: val }).eq('id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('🔒 Lock date set');
  await loadLockControlSection();
}

async function clearLockedThroughDate() {
  if (!confirm('Remove the lock entirely? All entries become editable again.')) return;
  const { error } = await db.from('dr_organizations').update({ locked_through_date: null }).eq('id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Lock cleared');
  await loadLockControlSection();
}
