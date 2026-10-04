import { removeBackground } from '@imgly/background-removal';
// Separate worker: tensor code generation is confined here, never in the page.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ image: Blob; publicPath: string }>) => void) | null;
  postMessage: (message: any) => void;
};
scope.onmessage = async event => {
  try {
    const foreground = await removeBackground(event.data.image, {
      publicPath: event.data.publicPath, model: 'isnet_quint8', device: 'cpu', proxyToWorker: false,
      output: { format: 'image/png' },
      progress: (key, current, total) => scope.postMessage({ progress: `${key.startsWith('compute') ? 'Removing portrait background' : 'Preparing background-removal model'}… ${Math.min(100, Math.round(current / Math.max(1, total) * 100))}%` }),
    });
    scope.postMessage({ foreground });
  } catch (error: any) { scope.postMessage({ error: error?.message || 'Background removal failed.' }); }
};
