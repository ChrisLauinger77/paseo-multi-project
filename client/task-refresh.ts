export function createTaskRefresh(invalidate: () => void, delayMs = 750) {
  let initialSnapshot = true;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function update() {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invalidate();
    }, delayMs);
  }
  return {
    snapshot() {
      if (initialSnapshot) initialSnapshot = false;
      else update();
    },
    update,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
