import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [debugLines, setDebugLines] = useState<string[]>([])

  function dbg(msg: string) {
    setDebugLines((prev) => [...prev.slice(-6), msg])
  }

  useEffect(() => {
    let active = true
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints)
    dbg('Reader created')

    function startScanning(constraints: MediaStreamConstraints) {
      dbg(`Starting: ${JSON.stringify(constraints)}`)
      reader
        .decodeFromConstraints(constraints, videoRef.current!, (result, err) => {
          if (!active || scannedRef.current) return
          if (result) {
            dbg(`✓ Got result: ${result.getText()}`)
            scannedRef.current = true
            controlsRef.current?.stop()
            onScan(result.getText())
          } else if (err && !err.message.includes('No MultiFormat')) {
            dbg(`cb err: ${err.name}: ${err.message}`)
          }
        })
        .then((controls) => { controlsRef.current = controls; dbg('Controls ready') })
        .catch((err: unknown) => {
          if (!active) return
          const name = err instanceof Error ? err.name : String(err)
          dbg(`Start failed: ${name}`)
          if (name === 'OverconstrainedError' || name === 'NotFoundError') {
            startScanning({ video: true })
          } else if (name === 'SecurityError' || !window.isSecureContext) {
            setError('Camera requires HTTPS. Access the app via https:// or enable Tailscale HTTPS certificates.')
          } else if (name === 'NotAllowedError') {
            setError('Camera permission denied. Allow camera access in your browser settings and try again.')
          } else {
            setError(`Camera unavailable: ${name}`)
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
          <div className="mt-3 w-full max-w-sm px-4 font-mono text-xs text-green-400 space-y-0.5">
            {debugLines.map((line, i) => <p key={i}>{line}</p>)}
          </div>
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
