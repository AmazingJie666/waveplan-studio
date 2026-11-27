import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

interface OnboardingModalProps {
  onClose: () => void;
  onQuickOptimizeDemo?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onClose,
  onQuickOptimizeDemo,
}) => {
  const { t, lang, setLang } = useI18n();
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const handleFinish = (runDemo = false) => {
    try {
      if (dontShowAgain) {
        localStorage.setItem('waveplan_onboarding_v1', '1');
      }
    } catch {
      // ignore storage errors
    }
    onClose();
    if (runDemo && onQuickOptimizeDemo) {
      onQuickOptimizeDemo();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 no-print">
      <div className="bg-white border border-[#E3E3DF] rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ECECE7] flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#EA580C] text-white font-mono-tech text-[10px] font-semibold tracking-wider">
                {t('onboardBadge')}
              </span>
              <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="px-2 py-0.5 rounded border border-[#DCDCD6] text-[10px] font-mono-tech text-[#5C6066] hover:text-[#18191B] cursor-pointer"
              >
                {lang === 'zh' ? 'English' : '中文'}
              </button>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#18191B] mt-1">
              {t('onboardTitle')}
            </h2>
            <p className="text-xs text-[#686D75] mt-0.5">{t('onboardSub')}</p>
          </div>
          <button
            onClick={() => handleFinish(false)}
            className="p-1.5 rounded-lg text-[#686D75] hover:bg-[#EFEFEA] cursor-pointer self-start"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Visual Cards Side-by-Side (Understand in 5 seconds) */}
        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Step 1 */}
          <div className="rounded-xl border border-[#E3E3DF] bg-[#FAFAF8] p-3.5 flex flex-col">
            <div className="h-24 rounded-lg bg-white border border-[#ECECE7] flex items-center justify-center mb-3 p-2">
              <svg viewBox="0 0 120 72" className="w-full h-full">
                <rect x="14" y="10" width="92" height="52" fill="none" stroke="#18191B" strokeWidth="3" />
                <line x1="60" y1="10" x2="60" y2="42" stroke="#52565E" strokeWidth="2.5" />
                <line x1="60" y1="42" x2="106" y2="42" stroke="#52565E" strokeWidth="2.5" />
                <line x1="14" y1="67" x2="106" y2="67" stroke="#EA580C" strokeWidth="2" />
                <circle cx="14" cy="67" r="2.5" fill="#EA580C" />
                <circle cx="106" cy="67" r="2.5" fill="#EA580C" />
                <text x="60" y="64" textAnchor="middle" fontSize="8" fill="#EA580C" fontWeight="700">12.0 m</text>
              </svg>
            </div>
            <h3 className="text-xs font-bold text-[#18191B]">{t('step1Title')}</h3>
            <p className="text-[11.5px] text-[#5C6066] mt-1 leading-relaxed">
              {t('step1Desc')}
            </p>
            <div className="mt-2 p-2 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] text-[10.5px] font-medium text-[#C2410C] leading-snug">
              {t('step1ScaleWarn')}
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-[#E3E3DF] bg-[#FAFAF8] p-3.5 flex flex-col">
            <div className="h-24 rounded-lg bg-white border border-[#ECECE7] flex items-center justify-center mb-3 p-2">
              <svg viewBox="0 0 120 72" className="w-full h-full">
                <rect x="14" y="10" width="92" height="52" fill="none" stroke="#9398A1" strokeWidth="2" />
                <rect x="18" y="30" width="14" height="12" rx="2" fill="#18191B" stroke="#EA580C" strokeWidth="1.5" />
                <circle cx="84" cy="24" r="5" fill="#EA580C" />
                <circle cx="84" cy="24" r="9" fill="none" stroke="#EA580C" strokeOpacity="0.4" strokeWidth="1.5" />
                <circle cx="88" cy="48" r="5" fill="#0F766E" />
                <text x="84" y="13" textAnchor="middle" fontSize="7" fill="#18191B" fontWeight="600">
                  {lang === 'zh' ? '书房' : 'Desk'}
                </text>
                <text x="88" y="60" textAnchor="middle" fontSize="7" fill="#18191B" fontWeight="600">
                  {lang === 'zh' ? '主卧' : 'Bed'}
                </text>
              </svg>
            </div>
            <h3 className="text-xs font-bold text-[#18191B]">{t('step2Title')}</h3>
            <p className="text-[11.5px] text-[#5C6066] mt-1 leading-relaxed">
              {t('step2Desc')}
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-[#E3E3DF] bg-[#FAFAF8] p-3.5 flex flex-col">
            <div className="h-24 rounded-lg bg-white border border-[#ECECE7] flex items-center justify-center mb-3 p-2">
              <svg viewBox="0 0 120 72" className="w-full h-full">
                <defs>
                  <radialGradient id="g1" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.7" />
                    <stop offset="65%" stopColor="#84CC16" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect x="14" y="10" width="92" height="52" fill="none" stroke="#18191B" strokeWidth="2.5" />
                <circle cx="48" cy="36" r="26" fill="url(#g1)" />
                <circle cx="84" cy="36" r="22" fill="url(#g1)" />
                <polyline points="22,36 48,36 84,36" fill="none" stroke="#EA580C" strokeWidth="1.8" strokeDasharray="3 2" />
                <circle cx="48" cy="36" r="5" fill="#18191B" stroke="#FFFFFF" strokeWidth="1.5" />
                <circle cx="84" cy="36" r="5" fill="#18191B" stroke="#FFFFFF" strokeWidth="1.5" />
              </svg>
            </div>
            <h3 className="text-xs font-bold text-[#18191B]">{t('step3Title')}</h3>
            <p className="text-[11.5px] text-[#5C6066] mt-1 leading-relaxed">
              {t('step3Desc')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAFAF8] border-t border-[#ECECE7] flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-[#5C6066] cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-[#18191B] w-3.5 h-3.5"
            />
            <span>{t('dontShowAgain')}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFinish(false)}
              className="px-3.5 py-2 rounded-xl border border-[#DCDCD6] bg-white hover:bg-[#F3F3EE] text-xs font-medium text-[#18191B] cursor-pointer"
            >
              {t('exploreSelf')}
            </button>
            <button
              onClick={() => handleFinish(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#D94E07] text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('tryAutoOpt')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
