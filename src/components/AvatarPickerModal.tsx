import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Smile, Link as LinkIcon, Check, Camera, RefreshCw } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarUrl?: string;
  userName?: string;
  onSelectAvatar: (newAvatarUrl: string) => void;
}

export const PRESET_EMOJIS = [
  // Candies & Sweets
  '🍬', '🍭', '🍫', '🐻', '🍓', '🍿', '🧁', '🍩', '🍦', '🍇',
  // Work & Badges
  '👑', '💼', '📦', '🏬', '🧑‍💻', '🛡️', '🚀', '⚡', '🌟', '🎯',
  // Fun Animals & Characters
  '🦊', '🦁', '🐱', '🐼', '🐻‍❄️', '🐶', '🤖', '👾', '🦄', '🎨',
];

export const PRESET_PHOTOS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
];

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen,
  onClose,
  currentAvatarUrl,
  userName,
  onSelectAvatar,
}) => {
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentAvatarUrl || 'emoji:🍬');
  const [activeTab, setActiveTab] = useState<'emojis' | 'photos' | 'upload' | 'url'>('emojis');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('A imagem deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setSelectedAvatar(result);
      }
    };
    reader.onerror = () => {
      setUploadError('Erro ao carregar a imagem. Tente novamente.');
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (activeTab === 'url' && customUrl.trim()) {
      onSelectAvatar(customUrl.trim());
    } else {
      onSelectAvatar(selectedAvatar);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left my-8">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-600 text-white shrink-0 shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">
                Foto de Perfil / Avatar
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                {userName ? `Personalize o avatar de ${userName}` : 'Escolha uma foto ou emoji pré-selecionado'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Selection Preview */}
        <div className="p-4 bg-rose-50/50 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar avatarUrl={selectedAvatar} name={userName} className="w-14 h-14 rounded-2xl shadow-sm" />
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visualização Atual:</p>
              <p className="text-sm font-black text-slate-900 truncate">
                {selectedAvatar.startsWith('emoji:') || (selectedAvatar.length <= 6 && !selectedAvatar.startsWith('http'))
                  ? `Emoji ${selectedAvatar.replace('emoji:', '')}`
                  : selectedAvatar.startsWith('data:')
                  ? 'Foto enviada (Arquivo)'
                  : 'Foto Selecionada'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedAvatar('emoji:🍬')}
            className="text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-rose-100/80 hover:bg-rose-200/80 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Redefinir</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('emojis')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'emojis'
                ? 'bg-white text-rose-700 shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Smile className="w-4 h-4 text-amber-500" />
            <span>Emojis</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('photos')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'photos'
                ? 'bg-white text-rose-700 shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-sky-500" />
            <span>Fotos Pré</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-rose-700 shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-500" />
            <span>Enviar Foto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'url'
                ? 'bg-white text-rose-700 shadow-2xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <LinkIcon className="w-4 h-4 text-purple-500" />
            <span>URL</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 max-h-80 overflow-y-auto">
          
          {/* TAB 1: EMOJIS */}
          {activeTab === 'emojis' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-600">
                Selecione um emoji pré-definido para seu perfil:
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5">
                {PRESET_EMOJIS.map((emoji) => {
                  const emojiKey = `emoji:${emoji}`;
                  const isSelected = selectedAvatar === emojiKey || selectedAvatar === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emojiKey)}
                      className={`p-3 rounded-2xl text-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${
                        isSelected
                          ? 'bg-rose-100 border-2 border-rose-500 shadow-md ring-2 ring-rose-500/20'
                          : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <span>{emoji}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PRESET PHOTOS */}
          {activeTab === 'photos' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-600">
                Escolha uma foto da nossa galeria de avatares:
              </p>
              <div className="grid grid-cols-4 gap-3">
                {PRESET_PHOTOS.map((photoUrl, idx) => {
                  const isSelected = selectedAvatar === photoUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(photoUrl)}
                      className={`relative rounded-2xl overflow-hidden aspect-square border-2 transition-all hover:scale-105 ${
                        isSelected
                          ? 'border-rose-600 ring-2 ring-rose-500/30 shadow-md'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img src={photoUrl} alt="Avatar Preset" className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-rose-600/30 flex items-center justify-center">
                          <Check className="w-6 h-6 text-white drop-shadow-md" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/40 hover:bg-rose-50 rounded-3xl p-8 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight">
                    Clique para selecionar uma foto
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Formatos suportados: PNG, JPG ou WEBP (Máx. 5MB)
                  </p>
                </div>
              </div>

              {uploadError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  {uploadError}
                </p>
              )}
            </div>
          )}

          {/* TAB 4: URL */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Cole o link público de uma imagem (URL):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder="https://exemplo.com/minha-foto.jpg"
                  value={customUrl}
                  onChange={(e) => {
                    setCustomUrl(e.target.value);
                    if (e.target.value.trim()) {
                      setSelectedAvatar(e.target.value.trim());
                    }
                  }}
                  className="w-full text-xs font-bold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Cole a URL de qualquer imagem hospedada na web.
              </p>
            </div>
          )}

        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-900/20 transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar Foto/Avatar</span>
          </button>
        </div>

      </div>
    </div>
  );
};
