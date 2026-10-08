import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Save,
  Loader2,
} from 'lucide-react';
import type { DLQMessage } from '../types';

interface EditPayloadModalProps {
  isOpen: boolean;
  message: DLQMessage | null;
  onClose: () => void;
  onSave: (messageId: string, newBody: string) => Promise<void>;
}

export const EditPayloadModal: React.FC<EditPayloadModalProps> = ({
  isOpen,
  message,
  onClose,
  onSave,
}) => {
  const [payloadText, setPayloadText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      try {
        const parsed = JSON.parse(message.body);
        setPayloadText(JSON.stringify(parsed, null, 2));
      } catch {
        setPayloadText(message.body);
      }
      setJsonError(null);
      setSuccessMessage(null);
    }
  }, [message]);

  if (!isOpen || !message) return null;

  const validateJson = (val: string): boolean => {
    try {
      JSON.parse(val);
      setJsonError(null);
      return true;
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON format');
      return false;
    }
  };

  const handleChange = (val: string) => {
    setPayloadText(val);
    validateJson(val);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(payloadText);
      setPayloadText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch {
      setJsonError('Cannot format: invalid JSON syntax');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateJson(payloadText)) return;

    setIsSaving(true);
    try {
      await onSave(message.id, payloadText);
      setSuccessMessage('Payload updated');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Failed to save payload');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl p-7 sm:p-9 overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="font-mono text-xs">
            <h3 className="text-base font-bold text-white tracking-tight">Edit Dead-Letter Payload</h3>
            <p className="text-zinc-400 mt-0.5">Message ID: <span className="text-white font-medium">{message.id}</span></p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerts */}
        {jsonError && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{jsonError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-5 space-y-4 font-mono text-xs">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-zinc-300 font-medium uppercase tracking-wider text-[11px]">JSON Payload</label>
              <button
                type="button"
                onClick={handleFormat}
                className="flex items-center gap-1.5 text-zinc-300 hover:text-white px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer text-[11px]"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Format JSON</span>
              </button>
            </div>
            <textarea
              rows={12}
              value={payloadText}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/30 transition leading-relaxed resize-y shadow-inner"
              spellCheck={false}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !!jsonError}
              className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold rounded-full bg-white/90 hover:bg-white text-black transition active:scale-[0.98] disabled:opacity-40 cursor-pointer shadow-lg shadow-white/5"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save & Re-arm'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
