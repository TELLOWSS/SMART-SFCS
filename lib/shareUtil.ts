export interface SmartSfcsShareTemplateParams {
  workType: 'AL폼 검측' | 'AL폼 타설' | '갱폼 인상' | string;
  building: string;
  floor: string;
  status: '승인 요청' | '승인 완료' | string;
}

const showShareToast = (message: string) => {
  if (typeof document === 'undefined') return;

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.left = '50%';
  toast.style.bottom = '24px';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'rgba(15, 23, 42, 0.95)';
  toast.style.color = '#fff';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '10px';
  toast.style.fontSize = '12px';
  toast.style.fontWeight = '700';
  toast.style.zIndex = '99999';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';
  toast.style.border = '1px solid rgba(255,255,255,0.15)';
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 220ms ease';
  }, 1400);

  window.setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 1700);
};

export const handleShareMessage = async (title: string, text: string) => {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showShareToast('복사 완료');
      return;
    }

    window.prompt('아래 메시지를 복사하세요:', text);
    showShareToast('복사 완료');
  } catch (error) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        showShareToast('복사 완료');
        return;
      } catch {
        // ignore
      }
    }
    window.prompt('아래 메시지를 복사하세요:', text);
    showShareToast('복사 완료');
  }
};

export const buildSmartSfcsShareText = ({
  workType,
  building,
  floor,
  status
}: SmartSfcsShareTemplateParams) => {
  return `[SMART-SFCS 현장알림]\n▶ 공종: ${workType}\n▶ 위치: ${building} ${floor}\n▶ 상태: ${status}\n\n시스템에 접속하여 확인 및 후속 조치 바랍니다.`;
};
