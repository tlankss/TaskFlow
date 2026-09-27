import React, { useState } from 'react'
import { X, Check, Bookmark, BookOpen } from 'lucide-react'
import { Task } from '../../types'

interface ReadingProgressModalProps {
  isOpen: boolean
  onClose: () => void
  task: Task
  onSaveProgress: (taskId: string, actualPage: number, notes?: string) => void
}

export const ReadingProgressModal: React.FC<ReadingProgressModalProps> = ({
  isOpen,
  onClose,
  task,
  onSaveProgress,
}) => {
  const meta = task?.reading_meta
  const [actualPage, setActualPage] = useState<number>(meta?.end_page || meta?.start_page || 1)
  const [noteContent, setNoteContent] = useState<string>(task?.output_notes || '')

  React.useEffect(() => {
    if (task && isOpen) {
      setActualPage(task.reading_meta?.end_page || task.reading_meta?.start_page || 1)
      setNoteContent(task.output_notes || '')
    }
  }, [task, isOpen])

  if (!isOpen || !meta) return null

  const handleConfirm = () => {
    onSaveProgress(task.id, actualPage, noteContent)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-[#07C160]" />
            <h3 className="text-xs font-semibold">记录阅读进度与心得</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">当前阅读任务</span>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              《{meta.book_title}》{meta.chapter_title}
            </p>
            <p className="text-[11px] text-[#07C160] mt-0.5">
              目标范围: P{meta.start_page} ~ P{meta.end_page}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              今天实际读到了第几页？
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-mono">第</span>
              <input
                type="number"
                min={meta.start_page}
                value={actualPage}
                onChange={(e) => setActualPage(parseInt(e.target.value) || meta.start_page)}
                className="w-24 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold focus:outline-none focus:border-[#07C160]"
              />
              <span className="text-xs text-slate-400 font-mono">页</span>
              {actualPage > meta.end_page && (
                <span className="text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  超额完成 +{actualPage - meta.end_page} 页 🎉
                </span>
              )}
              {actualPage < meta.end_page && (
                <span className="text-[10px] text-amber-500 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full">
                  差 {meta.end_page - actualPage} 页，将自动顺延
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                金句摘录 / 读书笔记 (支持 AI 总结)
              </label>
              {noteContent.trim() && (
                <button
                  type="button"
                  onClick={async () => {
                    const key = localStorage.getItem('taskflow_ai_key')
                    if (!key) return
                    try {
                      const res = await fetch(`${localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                        body: JSON.stringify({
                          model: localStorage.getItem('taskflow_ai_model') || 'deepseek-chat',
                          messages: [
                            { role: 'system', content: '请将用户的零散读书随笔整理为 1-2 条精炼的读书笔记金句与行动感悟，中文输出。' },
                            { role: 'user', content: noteContent }
                          ],
                          max_tokens: 150
                        })
                      })
                      if (res.ok) {
                        const data = await res.json()
                        const polished = data.choices?.[0]?.message?.content
                        if (polished) setNoteContent(polished.trim())
                      }
                    } catch (e) {
                      console.warn('AI polish error:', e)
                    }
                  }}
                  className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1"
                >
                  <span>✨ AI 润色提炼</span>
                </button>
              )}
            </div>
            <textarea
              rows={4}
              placeholder="记录今天触动你的一句话、核心思考或实践灵感..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160] resize-y"
            />
          </div>

          {/* Action */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs text-slate-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-xs font-semibold text-white shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>保存并标记完成</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
