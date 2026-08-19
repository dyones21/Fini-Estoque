import React from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  avatarUrl?: string;
  name?: string;
  className?: string;
  iconClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  name,
  className = 'w-10 h-10 rounded-xl',
  iconClassName = 'w-5 h-5',
}) => {
  if (!avatarUrl) {
    return (
      <div className={`${className} bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center font-bold overflow-hidden shrink-0`}>
        <User className={iconClassName} />
      </div>
    );
  }

  // Check if avatarUrl is an emoji format (e.g. emoji:🍬 or single emoji character)
  const isEmoji = avatarUrl.startsWith('emoji:') || (avatarUrl.length <= 6 && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('data:'));
  const emojiChar = avatarUrl.startsWith('emoji:') ? avatarUrl.replace('emoji:', '') : avatarUrl;

  if (isEmoji) {
    return (
      <div className={`${className} bg-gradient-to-br from-rose-100 via-amber-50 to-rose-50 border border-rose-200 flex items-center justify-center text-lg sm:text-xl font-bold shadow-2xs shrink-0 select-none`}>
        <span>{emojiChar}</span>
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={name || 'Avatar do Usuário'}
      className={`${className} object-cover border border-slate-200 shrink-0`}
      onError={(e) => {
        (e.target as HTMLImageElement).onerror = null;
        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
      }}
    />
  );
};
