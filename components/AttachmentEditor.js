import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabaseBrowser';

/**
 * 表單用照片附件編輯器
 * - initialAttachments: 既有附件（含 file_path, caption）
 * - onChange({ existing, pending })：狀態變動時通知父層（建議存入 ref）
 *   - existing: [{id, file_path, caption, removed}]
 *   - pending:  [{key, file, caption, previewUrl}]
 */
export default function AttachmentEditor({
  initialAttachments = [],
  bucket,
  captionPresets = [],
  onChange,
}) {
  const [existing, setExisting] = useState(
    initialAttachments.map((a) => ({ ...a, removed: false }))
  );
  const [pending, setPending] = useState([]);
  const inputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const createdUrlsRef = useRef([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ existing, pending });
  }, [existing, pending]);

  // 元件卸載時釋放預覽圖 URL
  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const supabase = createClient();
  const publicUrl = (filePath) =>
    supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;

  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newPending = files.map((file, i) => {
      const previewUrl = URL.createObjectURL(file);
      createdUrlsRef.current.push(previewUrl);
      return {
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        caption: '',
        previewUrl,
      };
    });
    setPending((prev) => [...prev, ...newPending]);
    e.target.value = '';
  }

  function removeExisting(id) {
    setExisting((prev) => prev.map((a) => (a.id === id ? { ...a, removed: true } : a)));
  }

  function restoreExisting(id) {
    setExisting((prev) => prev.map((a) => (a.id === id ? { ...a, removed: false } : a)));
  }

  function removePending(key) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function setPendingCaption(key, caption) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, caption } : p)));
  }

  const visibleExisting = existing.filter((a) => !a.removed);
  const removedExisting = existing.filter((a) => a.removed);

  return (
    <div>
      {/* 既有照片（編輯模式） */}
      {visibleExisting.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleExisting.map((att) => (
            <div key={att.id} className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicUrl(att.file_path)}
                alt={att.caption || '既有照片'}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {att.caption && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] font-medium text-white">
                  {att.caption}
                </span>
              )}
              <button
                type="button"
                aria-label="移除照片"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
                onClick={() => removeExisting(att.id)}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 已標記移除的照片（儲存時才會真正刪除） */}
      {removedExisting.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {removedExisting.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => restoreExisting(att.id)}
              className="badge gap-1 border border-dashed border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
            >
              已移除照片（點擊還原）
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* 待上傳照片 */}
      {pending.length > 0 && (
        <div className={`space-y-3 ${visibleExisting.length > 0 || removedExisting.length > 0 ? 'mt-3' : ''}`}>
          {pending.map((p) => (
            <div
              key={p.key}
              className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-2.5"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="待上傳" className="h-full w-full object-cover" />
                <span className="absolute left-0 top-0 rounded-br-lg bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  新
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 truncate text-xs text-gray-500">{p.file.name}</p>
                <input
                  type="text"
                  className="input !py-1.5 !text-xs"
                  placeholder={captionPresets.length > 0 ? '照片說明（如：施工前）' : '照片說明（選填）'}
                  value={p.caption}
                  onChange={(e) => setPendingCaption(p.key, e.target.value)}
                />
                {captionPresets.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {captionPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPendingCaption(p.key, preset)}
                        className={`badge transition-colors ${
                          p.caption === preset
                            ? 'bg-accent-600 text-white'
                            : 'bg-accent-50 text-accent-600 hover:bg-accent-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="取消此照片"
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                onClick={() => removePending(p.key)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 新增照片按鈕 */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent-200 bg-accent-50/50 px-4 py-3.5 text-sm font-medium text-accent-600 transition-colors hover:bg-accent-50 ${
          existing.length > 0 || pending.length > 0 ? 'mt-3' : ''
        }`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21zM10.5 8.25h.008v.008H10.5V8.25z"
          />
        </svg>
        新增照片{captionPresets.length > 0 ? '（可標示施工前／中／後）' : ''}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}
