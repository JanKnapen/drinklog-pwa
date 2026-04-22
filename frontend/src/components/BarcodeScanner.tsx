import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

interface BarcodeDetectorResult { rawValue: string }
interface BarcodeDetectorAPI {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>
}
interface BarcodeDetectorConstructor { new(opts?: { formats: string[] }): BarcodeDetectorAPI }
declare global { interface Window { BarcodeDetector?: BarcodeDetectorConstructor } }

function makeHints() {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [debugLines, setDebugLines] = useState<string[]>([])

  function dbg(msg: string) {
    setDebugLines((prev) => [...prev.slice(-8), msg])
  }

  useEffect(() => {
    let active = true

    dbg(`BarcodeDetector: ${'BarcodeDetector' in window}`)
    dbg(`secureContext: ${window.isSecureContext}`)
    dbg(`UA: ${navigator.userAgent.slice(0, 60)}`)

    async function startNative() {
      dbg('Using BarcodeDetector (native)')
      const detector = new window.BarcodeDetector!({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      })
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch (err: unknown) {
        if (!active) return
        handleCameraError(err)
        return
      }
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})
      dbg('Camera ready')
      function scan() {
        if (!active || scannedRef.current) return
        detector.detect(video)
          .then((results) => {
            if (!active || scannedRef.current) return
            if (results.length > 0) {
              scannedRef.current = true
              onScan(results[0].rawValue)
            } else {
              rafRef.current = requestAnimationFrame(scan)
            }
          })
          .catch(() => { rafRef.current = requestAnimationFrame(scan) })
      }
      rafRef.current = requestAnimationFrame(scan)
    }

    function startZxing(constraints: MediaStreamConstraints) {
      dbg('Using ZXing (BarcodeDetector unavailable)')
      const reader = new BrowserMultiFormatReader(makeHints(), { delayBetweenScanAttempts: 100 })
      reader
        .decodeFromConstraints(constraints, videoRef.current!, (result, err) => {
          if (!active || scannedRef.current) return
          if (result) {
            scannedRef.current = true
            controlsRef.current?.stop()
            onScan(result.getText())
          } else if (err && !err.message.includes('No MultiFormat')) {
            dbg(`err: ${err.name}`)
          }
        })
        .then((controls) => { controlsRef.current = controls; dbg('ZXing ready') })
        .catch((err: unknown) => {
          if (!active) return
          const name = err instanceof Error ? err.name : String(err)
          if (name === 'OverconstrainedError' || name === 'NotFoundError') {
            startZxing({ video: true })
          } else {
            handleCameraError(err)
          }
        })
    }

    function handleCameraError(err: unknown) {
      const name = err instanceof Error ? err.name : String(err)
      dbg(`Camera error: ${name}`)
      if (name === 'SecurityError' || !window.isSecureContext) {
        setError('Camera requires HTTPS.')
      } else if (name === 'NotAllowedError') {
        setError('Camera permission denied. Allow camera access in your browser settings.')
      } else {
        setError(`Camera unavailable: ${name}`)
      }
    }

    if ('BarcodeDetector' in window) {
      startNative()
    } else {
      startZxing({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
    }

    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      controlsRef.current?.stop()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {error ? (
        <div className="px-6 text-center">
          <p className="text-white text-sm mb-6">{error}</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform">
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
          <button onClick={onClose} className="mt-4 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform">
            Close
          </button>
        </>
      )}
    </div>
  )
}
