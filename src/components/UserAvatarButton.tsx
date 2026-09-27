import React from 'react'
import { User, ShieldCheck, Cloud, Settings } from 'lucide-react'
import { UserProfile } from '../types'

interface UserAvatarButtonProps {
  userProfile: UserProfile | null
  onOpenProfileModal: () => void
}

export const UserAvatarButton: React.FC<UserAvatarButtonProps> = ({
  userProfile,
  onOpenProfileModal,
}) => {
  const name = userProfile?.name || 'Alex 职场极客'
  const roleTitle = userProfile?.role_title || '高级产品专家'
  const plan = userProfile?.plan || 'pro'

  return (
    <button
      onClick={onOpenProfileModal}
      className="w-full group p-2.5 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/5 hover:border-[#07C160]/30 transition-all text-left flex items-center justify-between shadow-sm"
    >
      <div className="flex items-center space-x-2.5 min-w-0">
        {/* Avatar Circle */}
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#07C160] to-[#059B4D] flex items-center justify-center text-white font-bold text-xs shadow-md shadow-[#07C160]/20">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#07C160] ring-2 ring-[#F5F5F5] dark:ring-[#181818]" />
        </div>

        {/* User Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-[#07C160] dark:group-hover:text-white">
              {name}
            </span>
            <span className="px-1 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider bg-[#07C160]/10 text-[#07C160] border border-[#07C160]/25">
              {plan}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{roleTitle}</p>
        </div>
      </div>

      <div className="p-1 rounded-lg text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
        <Settings className="w-3.5 h-3.5" />
      </div>
    </button>
  )
}
