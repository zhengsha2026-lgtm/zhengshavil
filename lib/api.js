import { createClient } from '@/lib/supabaseBrowser';

/** 取得某筆紀錄的附件列表 */
export async function fetchAttachments(relatedTable, relatedId) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('related_table', relatedTable)
    .eq('related_id', relatedId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** 取得附件的公開 URL */
export function attachmentPublicUrl(bucket, filePath) {
  const supabase = createClient();
  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
}

/**
 * 儲存附件變更：
 * - 刪除被標記移除的既有附件（含 Storage 檔案）
 * - 上傳待上傳檔案並寫入 attachments
 */
export async function saveAttachments({ relatedTable, relatedId, bucket, state }) {
  const supabase = createClient();
  const { existing = [], pending = [] } = state || {};

  for (const att of existing.filter((a) => a.removed)) {
    const { error: delError } = await supabase.from('attachments').delete().eq('id', att.id);
    if (delError) throw new Error(`刪除附件失敗：${delError.message}`);
    if (att.file_path) {
      await supabase.storage.from(bucket).remove([att.file_path]);
    }
  }

  for (const p of pending) {
    const ext = (p.file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, p.file, {
      contentType: p.file.type,
    });
    if (uploadError) throw new Error(`照片「${p.file.name}」上傳失敗：${uploadError.message}`);

    const { error: insertError } = await supabase.from('attachments').insert({
      related_table: relatedTable,
      related_id: relatedId,
      file_path: path,
      file_type: 'image',
      caption: p.caption?.trim() || null,
    });
    if (insertError) throw new Error(`照片「${p.file.name}」紀錄寫入失敗：${insertError.message}`);
  }
}

/** 刪除紀錄與其所有附件（含 Storage 檔案） */
export async function deleteRecordWithAttachments(relatedTable, bucket, recordId) {
  const supabase = createClient();
  const attachments = await fetchAttachments(relatedTable, recordId);

  const paths = attachments.map((a) => a.file_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(bucket).remove(paths);
  }

  if (attachments.length > 0) {
    const { error: attError } = await supabase
      .from('attachments')
      .delete()
      .eq('related_table', relatedTable)
      .eq('related_id', recordId);
    if (attError) throw new Error(`刪除附件失敗：${attError.message}`);
  }

  const { error } = await supabase.from(relatedTable).delete().eq('id', recordId);
  if (error) throw new Error(`刪除紀錄失敗：${error.message}`);
}

/** 搜尋關鍵字跳脫（供 or(...) 使用） */
export function escapeSearchKeyword(q) {
  if (!q) return '';
  return q.replace(/[,()]/g, ' ').trim();
}
