import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Save
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-md bg-zinc-950 border border-zinc-800 shadow-2xl p-8 sm:p-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-zinc-800">
          <div className="font-mono text-sm">
            <h3 className="text-base font-bold text-white">Edit Dead-Letter Payload</h3>
            <p className="text-zinc-400 mt-1">Message ID: <span className="text-white font-medium">{message.id}</span></p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Success Alert (Emerald) */}
        {successMessage && (
          <div className="mt-6 p-4 sm:p-5 rounded-md bg-emerald-950/30 border border-emerald-900/60 text-emerald-300 text-xs flex items-center gap-3 font-mono shadow-sm">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* JSON Syntax Error Alert (Red) */}
        {jsonError && (
          <div className="mt-6 p-4 sm:p-5 rounded-md bg-red-950/30 border border-red-900/60 text-red-300 text-xs flex items-center gap-3 font-mono shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{jsonError}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2.5 font-mono text-xs">
              <span className="text-zinc-300 uppercase tracking-wider font-semibold">JSON Payload</span>
              <button
                type="button"
                onClick={handleFormat}
                className="text-zinc-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Format JSON</span>
              </button>
            </div>

            <textarea
              rows={14}
              value={payloadText}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-md p-5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 transition leading-relaxed resize-y"
              spellCheck={false}
            />
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3.5 pt-6 border-t border-zinc-800 font-sans text-sm">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-zinc-400 hover:text-white border border-zinc-800 hover:bg-zinc-900 rounded-md transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !!jsonError}
              className="px-6 py-2.5 font-semibold text-black bg-white hover:bg-zinc-200 rounded-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{isSaving ? 'Saving...' : 'Save Payload'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
