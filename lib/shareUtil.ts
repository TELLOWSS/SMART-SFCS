export interface SmartSfcsShareTemplateParams {
  workType: 'AL폼 검측' | 'AL폼 타설' | '갱폼 인상' | string;
  building: string;
  floor: string;
  status: '승인 요청' | '승인 완료' | string;
}

const copyTextFallback = async (text: string): Promise<boolean> => {
  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(success);
  } catch {
    return false;
  }
};

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
  if (!text?.trim()) {
    showShareToast('공유할 내용이 비어 있습니다.');
    return;
  }

  try {
    const canUseNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const canUseClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

    if (canUseNativeShare) {
      await navigator.share({ title, text });
      showShareToast('공유 창 전송 완료');
      return;
    }

    if (canUseClipboard) {
      await navigator.clipboard.writeText(text);
      showShareToast('PC 환경: 메시지를 클립보드에 복사했습니다.');
      return;
    }

    const copied = await copyTextFallback(text);
    if (copied) {
      showShareToast('메시지 복사 완료');
      return;
    }

    window.prompt('공유창을 사용할 수 없어 수동 복사가 필요합니다. 아래 메시지를 복사하세요:', text);
    showShareToast('수동 복사를 진행해 주세요.');
  } catch (error) {
    const canUseClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

    if (canUseClipboard) {
      try {
        await navigator.clipboard.writeText(text);
        showShareToast('공유창 실패: 메시지를 클립보드에 복사했습니다.');
        return;
      } catch {
        // ignore
      }
    }

    const copied = await copyTextFallback(text);
    if (copied) {
      showShareToast('공유창 실패: 메시지 복사 완료');
      return;
    }

    const reason = error instanceof Error && error.message ? `(${error.message})` : '';
    window.prompt(`공유 실패 ${reason} 수동 복사를 진행해 주세요:`, text);
    showShareToast('공유 실패: 수동 복사가 필요합니다.');
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
