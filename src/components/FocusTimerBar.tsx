import React, { useState, useEffect } from 'react'
import { Play, Pause, RotateCcw, CheckCircle2, Flame, BellRing } from 'lucide-react'
import confetti from 'canvas-confetti'
import { Task } from '../types'

interface FocusTimerBarProps {
  activeTask: Task | null
  onTaskCompleted: (task: Task) => void
}

export const FocusTimerBar: React.FC<FocusTimerBarProps> = ({
  activeTask,
  onTaskCompleted,
}) => {
  const [seconds, setSeconds] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (activeTask) {
      setSeconds((activeTask.estimated_minutes || 25) * 60)
      setIsRunning(true)
    }
  }, [activeTask])

  useEffect(() => {
    let interval: any = null
    if (isRunning && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => {
          const next = prev - 1
          const mins = Math.floor(next / 60)
          const secs = next % 60
          const timeStr = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`

          // Sync with macOS Menu Bar
          if (activeTask && window.electronAPI?.updateTrayTitle) {
            window.electronAPI.updateTrayTitle(`[${timeStr}] ${activeTask.title.slice(0, 10)}...`)
          }
          return next
        })
      }, 1000)
    } else if (seconds === 0 && isRunning) {
      setIsRunning(false)
      // Confetti celebration
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } })
    }
    return () => clearInterval(interval)
  }, [isRunning, seconds, activeTask])

  if (!activeTask) return null

  const formatTime = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60)
    const s = totalSecs % 60
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleFinish = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.7 } })
    onTaskCompleted(activeTask)
    setIsRunning(false)
    if (window.electronAPI?.updateTrayTitle) {
      window.electronAPI.updateTrayTitle('TaskFlow')
    }
  }

  return (
    <div className="mx-6 mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-white/90 to-teal-50/80 dark:from-emerald-950/50 dark:via-slate-900/90 dark:to-teal-950/50 border border-[#07C160]/30 shadow-lg shadow-[#07C160]/5 backdrop-blur-md flex items-center justify-between no-drag transition-colors">
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160] shrink-0">
          <Flame className="w-5 h-5 animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#07C160]/15 text-[#07C160]">
              专注进行中
            </span>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-xs">{activeTask.title}</h4>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            预估用时: {activeTask.estimated_minutes || 25}m | 已同屏至 Mac 顶部菜单栏
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4 shrink-0">
        {/* Timer Display */}
        <div className="font-mono text-xl font-bold tracking-wider text-[#07C160]">
          {formatTime(seconds)}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-700 dark:text-white transition-colors"
            title={isRunning ? '暂停' : '继续'}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={handleFinish}
            className="px-3.5 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-lg shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>完成此项</span>
          </button>
        </div>
      </div>
    </div>
  )
}
