import React, { useState, useRef, useEffect } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Check,
  X,
} from 'lucide-react'

export interface DatePickerProps {
  value?: string // YYYY-MM-DD
  onChange: (dateStr: string) => void
  placeholder?: string
  size?: 'xs' | 'sm' | 'md'
  align?: 'left' | 'right' | 'center'
  className?: string
  showQuickPresets?: boolean
  clearable?: boolean
  disabled?: boolean
  title?: string
}

// 辅助工具：补零
const padZero = (n: number) => (n < 10 ? `0${n}` : `${n}`)

// 格式化为 YYYY-MM-DD
export const formatDateStr = (d: Date): string => {
  const y = d.getFullYear()
  const m = padZero(d.getMonth() + 1)
  const day = padZero(d.getDate())
  return `${y}-${m}-${day}`
}

// 解析 YYYY-MM-DD 为本地 Date
export const parseDateStr = (str?: string): Date => {
  if (!str) return new Date()
  const parts = str.split('-').map(Number)
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2])
  }
  return new Date()
}

// 格式化展示文本（如：2026/09/26 周六 或 9月26日）
export const formatDisplayDate = (str?: string, mode: 'full' | 'short' | 'compact' = 'compact'): string => {
  if (!str) return '未定日期'
  const date = parseDateStr(str)
  const today = formatDateStr(new Date())
  const tomorrow = formatDateStr(new Date(Date.now() + 86400000))
  
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekStr = weekDays[date.getDay()]

  if (str === today) {
    return mode === 'compact' ? `今天 (${date.getMonth() + 1}/${date.getDate()})` : `今天 · ${weekStr}`
  }
  if (str === tomorrow) {
    return mode === 'compact' ? `明天 (${date.getMonth() + 1}/${date.getDate()})` : `明天 · ${weekStr}`
  }

  if (mode === 'compact') {
    return `${date.getFullYear()}/${padZero(date.getMonth() + 1)}/${padZero(date.getDate())}`
  }
  if (mode === 'short') {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekStr}`
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = '选择日期',
  size = 'sm',
  align = 'left',
  className = '',
  showQuickPresets = true,
  clearable = false,
  disabled = false,
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)

  // 内部日历视图当前显示的 年/月
  const initialDate = value ? parseDateStr(value) : new Date()
  const [viewYear, setViewYear] = useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()) // 0-11

  const containerRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // 当外部 value 改变且弹窗未打开时，同步更新内部视图月份
  useEffect(() => {
    if (value && !isOpen) {
      const d = parseDateStr(value)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [value, isOpen])

  // 检测向上展开或向下展开
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropdownHeight = showQuickPresets ? 360 : 310
      setOpenUpward(spaceBelow < dropdownHeight && rect.top > dropdownHeight)
    }
  }, [isOpen, showQuickPresets])

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isOpen])

  // 月份导航
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // 快捷预设日期
  const handleSelectPreset = (daysOffset: number) => {
    const target = new Date()
    target.setDate(target.getDate() + daysOffset)
    const dateStr = formatDateStr(target)
    onChange(dateStr)
    setViewYear(target.getFullYear())
    setViewMonth(target.getMonth())
    setIsOpen(false)
  }

  const handleSelectNextMonday = () => {
    const target = new Date()
    const currentDay = target.getDay()
    const daysUntilNextMon = currentDay === 0 ? 1 : 8 - currentDay
    target.setDate(target.getDate() + daysUntilNextMon)
    const dateStr = formatDateStr(target)
    onChange(dateStr)
    setViewYear(target.getFullYear())
    setViewMonth(target.getMonth())
    setIsOpen(false)
  }

  // 选中具体日期
  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr)
    setIsOpen(false)
  }

  // 生成日历网格数据 (42格标准月历)
  const todayStr = formatDateStr(new Date())
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
  // 周一为 0，周日为 6
  let startOffset = firstDayOfMonth.getDay() - 1
  if (startOffset === -1) startOffset = 6

  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0)
  const daysInCurrentMonth = lastDayOfMonth.getDate()

  const lastDayOfPrevMonth = new Date(viewYear, viewMonth, 0)
  const daysInPrevMonth = lastDayOfPrevMonth.getDate()

  const calendarDays: Array<{
    dateStr: string
    dayNum: number
    isCurrentMonth: boolean
    isToday: boolean
    isSelected: boolean
  }> = []

  // 上月溢出
  for (let i = startOffset - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i
    const prevDate = new Date(viewYear, viewMonth - 1, dayNum)
    const dStr = formatDateStr(prevDate)
    calendarDays.push({
      dateStr: dStr,
      dayNum,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === value,
    })
  }

  // 当月日期
  for (let i = 1; i <= daysInCurrentMonth; i++) {
    const curDate = new Date(viewYear, viewMonth, i)
    const dStr = formatDateStr(curDate)
    calendarDays.push({
      dateStr: dStr,
      dayNum: i,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isSelected: dStr === value,
    })
  }

  // 下月溢出补满 42 格
  const remainingCells = 42 - calendarDays.length
  for (let i = 1; i <= remainingCells; i++) {
    const nextDate = new Date(viewYear, viewMonth + 1, i)
    const dStr = formatDateStr(nextDate)
    calendarDays.push({
      dateStr: dStr,
      dayNum: i,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === value,
    })
  }

  // 尺寸样式映射
  const sizeClasses = {
    xs: 'h-6 px-2 text-[10px] space-x-1',
    sm: 'h-7 px-2.5 text-xs space-x-1.5',
    md: 'h-8 px-3 text-xs space-x-2',
  }[size]

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left select-none ${className}`}
      title={title}
    >
      {/* 触发按钮 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-lg border font-mono flex items-center justify-between transition-all duration-150 ${sizeClasses} ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'
            : isOpen
            ? 'bg-emerald-50 dark:bg-[#07C160]/15 border-[#07C160] text-[#07C160] shadow-sm shadow-[#07C160]/20 font-semibold'
            : value
            ? 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-[#07C160]/60 text-slate-700 dark:text-slate-200 hover:text-[#07C160] shadow-xs'
            : 'bg-white dark:bg-slate-800/60 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center space-x-1.5 truncate">
          <CalendarIcon
            className={`shrink-0 ${size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${
              value || isOpen ? 'text-[#07C160]' : 'text-slate-400'
            }`}
          />
          <span className="truncate">
            {value ? formatDisplayDate(value, size === 'xs' ? 'compact' : 'compact') : placeholder}
          </span>
        </div>

        {clearable && value && !disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            className="ml-1 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="清除日期"
          >
            <X className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* 现代极简卡片弹出层 Popover */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute z-[999] w-[280px] p-3 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-700/80 shadow-2xl shadow-black/25 dark:shadow-black/60 text-slate-800 dark:text-slate-100 transition-all transform origin-top duration-150 animate-in fade-in zoom-in-95 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${
            align === 'right'
              ? 'right-0'
              : align === 'center'
              ? 'left-1/2 -translate-x-1/2'
              : 'left-0'
          }`}
        >
          {/* 快捷预设流转药丸 (Quick Presets) */}
          {showQuickPresets && (
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-black/5 dark:border-white/10 text-[11px] gap-1">
              <button
                type="button"
                onClick={() => handleSelectPreset(0)}
                className={`flex-1 py-1 rounded-lg text-center font-medium transition-colors ${
                  value === todayStr
                    ? 'bg-[#07C160] text-white font-semibold shadow-xs'
                    : 'bg-black/5 dark:bg-white/5 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-600 dark:text-slate-300'
                }`}
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(1)}
                className="flex-1 py-1 rounded-lg text-center font-medium bg-black/5 dark:bg-white/5 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-600 dark:text-slate-300 transition-colors"
              >
                明天
              </button>
              <button
                type="button"
                onClick={handleSelectNextMonday}
                className="flex-1 py-1 rounded-lg text-center font-medium bg-black/5 dark:bg-white/5 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-600 dark:text-slate-300 transition-colors"
              >
                下周一
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset(7)}
                className="flex-1 py-1 rounded-lg text-center font-medium bg-black/5 dark:bg-white/5 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-600 dark:text-slate-300 transition-colors"
              >
                +7天
              </button>
            </div>
          )}

          {/* 年月导航条 */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold font-mono tracking-tight text-slate-900 dark:text-white flex items-center space-x-1">
              <span>{viewYear}年</span>
              <span>{viewMonth + 1}月</span>
            </span>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="上个月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const now = new Date()
                  setViewYear(now.getFullYear())
                  setViewMonth(now.getMonth())
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-[#07C160] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="回到当月"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="下个月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 星期表头 */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1 py-0.5">
            <span>一</span>
            <span>二</span>
            <span>三</span>
            <span>四</span>
            <span>五</span>
            <span className="text-amber-500/80">六</span>
            <span className="text-amber-500/80">日</span>
          </div>

          {/* 日期数字单元格网格 (42格) */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((cell, idx) => {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(cell.dateStr)}
                  className={`h-7 rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all relative ${
                    cell.isSelected
                      ? 'bg-[#07C160] text-white font-bold shadow-md shadow-[#07C160]/30 z-10'
                      : cell.isCurrentMonth
                      ? 'text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10'
                      : 'text-slate-300 dark:text-slate-600 hover:bg-black/5 dark:hover:bg-white/5'
                  } ${
                    cell.isToday && !cell.isSelected
                      ? 'ring-1 ring-[#07C160] font-semibold text-[#07C160] dark:text-[#07C160]'
                      : ''
                  }`}
                  title={`${cell.dateStr}${cell.isToday ? ' (今天)' : ''}`}
                >
                  <span>{cell.dayNum}</span>
                  {cell.isToday && !cell.isSelected && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#07C160]"></span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 底部功能条 */}
          <div className="mt-2.5 pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono text-[10px]">
              {value ? formatDisplayDate(value, 'short') : '未选择'}
            </span>

            <div className="flex items-center space-x-2">
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setIsOpen(false)
                  }}
                  className="text-slate-400 hover:text-red-500 text-[10px] transition-colors"
                >
                  清除
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSelectPreset(0)}
                className="px-2 py-0.5 rounded bg-[#07C160]/10 text-[#07C160] hover:bg-[#07C160]/20 text-[10px] font-semibold transition-colors"
              >
                选为今天
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
