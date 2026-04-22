import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const reader = new BrowserMultiFormatReader()

    function startScanning(constraints: MediaStreamConstraints) {
      reader
        .decodeFromConstraints(constraints, videoRef.current!, (result, _err, controls) => {
          if (!active) return
          controlsRef.current = controls
          if (result && !scannedRef.current) {
            scannedRef.current = true
            controls.stop()
            onScan(result.getText())
          }
        })
        .catch((err: unknown) => {
          if (!active) return
          const name = err instanceof Error ? err.name : ''
          if (name === 'OverconstrainedError' || name === 'NotFoundError') {
            // rear camera constraint failed — retry with any camera
            startScanning({ video: true })
          } else if (name === 'SecurityError' || !window.isSecureContext) {
            setError('Camera requires HTTPS. Access the app via https:// or enable Tailscale HTTPS certificates.')
          } else if (name === 'NotAllowedError') {
            setError('Camera permission denied. Allow camera access in your browser settings and try again.')
          } else {
            setError('Camera unavailable. Make sure no other app is using it.')
          }
        })
    }

    startScanning({ video: { facingMode: 'environment' } })

    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {error ? (
        <div className="px-6 text-center">
          <p className="text-white text-sm mb-6">{error}</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="relative w-full max-w-sm">
            <video ref={videoRef} className="w-full rounded-lg" playsInline muted autoPlay />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-[250px] h-[250px]">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br" />
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-neutral-300">Point at a barcode</p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform"
          >
            Close
          </button>
        </>
      )}
    </div>
  )
}
