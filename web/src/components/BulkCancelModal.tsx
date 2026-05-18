import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Button } from './atoms';
import { useBulkCancelSlots } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { isoDay } from '../lib/calendarUtils';
import type { Slot } from '../lib/types';

interface Props {
  open: boolean;
  teamId: string;
  slots: Slot[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

/**
 * Convert a yyyy-mm-dd local date to an ISO timestamp at midnight (start) or
 * 23:59:59.999 (end) in the local timezone. We use these as the inclusive
 * bounds passed to the bulk-cancel hook, matching the user's mental model:
 * "from 2026-05-01 to 2026-05-03" should include anything starting on May 3.
 */
function localDayStartISO(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T00:00:00`).toISOString();
}
function localDayEndISO(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T23:59:59.999`).toISOString();
}

export function BulkCancelModal({ open, teamId, slots, onClose, onToast }: Props) {
  const { user } = useAuth();
  const bulkCancel = useBulkCancelSlots();

  // Defaults: today → +7 days.
  const today = useMemo(() => isoDay(new Date()), []);
  const weekOut = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return isoDay(d);
  }, []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(weekOut);

  // Reset to defaults each time the modal is reopened.
  useEffect(() => {
    if (open) {
      setFrom(today);
      setTo(weekOut);
    }
  }, [open, today, weekOut]);

  // Compute how many slots would be cancelled, based on the cached slots list.
  // We mirror the server-side filter: state in (draft, published) and
  // start_at within [fromISO, toISO].
  const matchCount = useMemo(() => {
    if (!from || !to) return 0;
    const fromMs = Date.parse(localDayStartISO(from));
    const toMs = Date.parse(localDayEndISO(to));
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) return 0;
    return slots.filter((s) => {
      if (s.state !== 'draft' && s.state !== 'published') return false;
      const startMs = Date.parse(s.start_at);
      return startMs >= fromMs && startMs <= toMs;
    }).length;
  }, [slots, from, to]);

  if (!open) return null;

  const rangeInvalid = !from || !to || Date.parse(from) > Date.parse(to);

  const confirm = async () => {
    if (!user || rangeInvalid || matchCount === 0) return;
    const cancelled = await bulkCancel.mutateAsync({
      teamId,
      fromISO: localDayStartISO(from),
      toISO: localDayEndISO(to),
      actorId: user.id,
      actorName: user.name,
    });
    onClose();
    onToast(
      cancelled === 0
        ? 'No slots matched — nothing cancelled'
        : `Cancelled ${cancelled} slot${cancelled === 1 ? '' : 's'}`,
    );
  };

  return (
    <div className="modal-overlay" data-open="1" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bulk cancel slots">
        <div className="modal-head">
          <h2>Bulk-cancel <em>slots</em></h2>
          <button className="action-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
            Cancels every <b>draft</b> or <b>published</b> slot whose start date falls in the
            range below. Completed and already-cancelled slots are not affected.
          </p>

          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="bulk-cancel-from">From</label>
              <input
                id="bulk-cancel-from"
                className="input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="bulk-cancel-to">To</label>
              <input
                id="bulk-cancel-to"
                className="input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div
            data-testid="bulk-cancel-match-count"
            style={{
              marginBlockStart: 14,
              padding: '10px 12px',
              borderRadius: 6,
              background: rangeInvalid
                ? 'var(--urgent-bg)'
                : matchCount === 0
                  ? 'var(--card-soft)'
                  : 'var(--urgent-bg)',
              color: rangeInvalid
                ? 'var(--urgent-deep)'
                : matchCount === 0
                  ? 'var(--ink-soft)'
                  : 'var(--urgent-deep)',
              fontSize: 13,
              fontFamily: 'var(--mono)',
            }}
          >
            {rangeInvalid
              ? 'Invalid date range — "From" must be on or before "To".'
              : matchCount === 0
                ? 'No slots match this range.'
                : `${matchCount} slot${matchCount === 1 ? '' : 's'} will be cancelled.`}
          </div>
        </div>

        <div className="modal-foot">
          <div className="left" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
            This action cannot be undone from the UI.
          </div>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="urgent"
            icon="x"
            disabled={bulkCancel.isPending || rangeInvalid || matchCount === 0}
            onClick={confirm}
          >
            Cancel {matchCount > 0 ? `${matchCount} ` : ''}slot{matchCount === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  );
}
