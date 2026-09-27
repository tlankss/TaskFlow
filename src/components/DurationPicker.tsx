import React, { useState, useRef, useEffect } from 'react'
import { Clock, ChevronDown } from 'lucide-react'

interface DurationPickerProps {
  value: number // in minutes
  onChange: (minutes: number) => void
  size?: 'sm' | 'md'
  align?: 'left' | 'right'
  className?: string
  showUnitText?: boolean
}

// 智能时长格式化工具函数（支持分 m 与小时 h 展示）
export const formatDuration = (minutes: number = 0, showUnitText: boolean = false): string => {
  if (!minutes || minutes <= 0) return showUnitText ? '0 分钟' : '0m'
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return showUnitText ? `${hours} 小时` : `${hours}h`
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    if (rem === 30) {
      return showUnitText ? `${hours + 0.5} 小时` : `${hours + 0.5}h`
    }
    return showUnitText ? `${hours}小时${rem}分` : `${hours}h ${rem}m`
  }
  return showUnitText ? `${minutes} 分钟` : `${minutes}m`
}

const MINUTE_PRESETS = [
  { val: 5, label: '5m' },
  { val: 15, label: '15m' },
  { val: 25, label: '25m', isPomodoro: true },
  { val: 30, label: '30m' },
  { val: 45, label: '45m' },
]

const HOUR_PRESETS = [
  { val: 60, label: '1h' },
  { val: 90, label: '1.5h' },
  { val: 120, label: '2h' },
  { val: 180, label: '3h' },
  { val: 240, label: '4h' },
]

export const DurationPicker: React.FC<DurationPickerProps> = ({
  value = 15,
  onChange,
  size = 'sm',
  align = 'right',
  className = '',
  showUnitText = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [customValue, setCustomValue] = useState(String(value || 15))
  const [customUnit, setCustomUnit] = useState<'m' | 'h'>('m')
  const [openUpward, setOpenUpward] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Keep custom value in sync when value changes from outside
  useEffect(() => {
    if (value >= 60 && value % 30 === 0) {
      setCustomValue(String(value / 60))
      setCustomUnit('h')
    } else {
      setCustomValue(String(value || 15))
      setCustomUnit('m')
    }
  }, [value])

  // Handle outside clicks to close popover
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // If there's less than 240px below, pop upwards
      setOpenUpward(window.innerHeight - rect.bottom < 240)
    }
    setIsOpen((prev) => !prev)
  }

  const handleSelectPreset = (minutes: number, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(minutes)
    if (minutes >= 60 && minutes % 30 === 0) {
      setCustomValue(String(minutes / 60))
      setCustomUnit('h')
    } else {
      setCustomValue(String(minutes))
      setCustomUnit('m')
    }
    setIsOpen(false)
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const num = parseFloat(customValue)
    if (!isNaN(num) && num > 0) {
      let finalMinutes = customUnit === 'h' ? Math.round(num * 60) : Math.round(num)
      if (finalMinutes > 1440) finalMinutes = 1440 // Cap at 24 hours
      if (finalMinutes < 1) finalMinutes = 1
      onChange(finalMinutes)
      setIsOpen(false)
    }
  }

  const displayText = formatDuration(value, showUnitText)

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        title="点击配置用时 (支持分钟与小时)"
        className={`flex items-center space-x-1 rounded-lg border transition-all duration-150 cursor-pointer select-none font-medium ${
          size === 'sm'
            ? 'px-2 py-0.5 text-[11px] leading-tight font-mono'
            : 'px-2.5 py-1.5 text-xs'
        } ${
          isOpen
            ? 'bg-[#07C160]/10 border-[#07C160]/40 text-[#07C160] shadow-xs'
            : 'bg-slate-100/80 dark:bg-white/5 border-slate-200/80 dark:border-white/10 hover:border-[#07C160]/40 text-slate-600 dark:text-slate-300 hover:text-[#07C160] hover:bg-[#07C160]/5'
        }`}
      >
        <Clock className={size === 'sm' ? 'w-2.5 h-2.5 shrink-0 opacity-70' : 'w-3.5 h-3.5 shrink-0 opacity-70'} />
        <span>{displayText}</span>
        <ChevronDown
          className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} opacity-50 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } w-56 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 text-slate-800 dark:text-slate-100`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-black/5 dark:border-white/5">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center space-x-1">
              <Clock className="w-2.5 h-2.5" />
              <span>选择预估用时</span>
            </span>
            <span className="text-[10px] font-mono text-[#07C160] font-semibold">
              当前: {displayText}
            </span>
          </div>

          {/* 分钟预设行 */}
          <div className="mb-2">
            <div className="text-[9px] text-slate-400 font-medium mb-1">分钟 (m)</div>
            <div className="grid grid-cols-5 gap-1">
              {MINUTE_PRESETS.map((p) => {
                const isSelected = value === p.val
                return (
                  <button
                    key={p.val}
                    type="button"
                    onClick={(e) => handleSelectPreset(p.val, e)}
                    className={`py-1 rounded text-xs font-mono transition-all text-center ${
                      isSelected
                        ? 'bg-[#07C160] text-white font-semibold shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 小时预设行 (h) */}
          <div className="mb-2.5">
            <div className="text-[9px] text-slate-400 font-medium mb-1">小时 (h)</div>
            <div className="grid grid-cols-5 gap-1">
              {HOUR_PRESETS.map((p) => {
                const isSelected = value === p.val
                return (
                  <button
                    key={p.val}
                    type="button"
                    onClick={(e) => handleSelectPreset(p.val, e)}
                    className={`py-1 rounded text-xs font-mono transition-all text-center ${
                      isSelected
                        ? 'bg-[#07C160] text-white font-semibold shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 自定义输入支持选 m / h */}
          <form
            onSubmit={handleApplyCustom}
            className="pt-2 border-t border-black/5 dark:border-white/5 space-y-1.5"
          >
            <div className="text-[9px] text-slate-400 font-medium">自定义数值与单位:</div>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                step="any"
                min={customUnit === 'h' ? 0.1 : 1}
                max={customUnit === 'h' ? 24 : 1440}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="数值"
                className="flex-1 min-w-0 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
              />

              {/* 单位切换器: m / h */}
              <div className="flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-white/5 text-[11px] font-mono shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomUnit('m')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    customUnit === 'm'
                      ? 'bg-[#07C160] text-white font-semibold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  m
                </button>
                <button
                  type="button"
                  onClick={() => setCustomUnit('h')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    customUnit === 'h'
                      ? 'bg-[#07C160] text-white font-semibold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  h
                </button>
              </div>

              <button
                type="submit"
                className="px-2 py-1 rounded-md bg-[#07C160] text-white text-xs font-medium hover:bg-[#06AD56] transition-colors shrink-0"
              >
                确定
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
