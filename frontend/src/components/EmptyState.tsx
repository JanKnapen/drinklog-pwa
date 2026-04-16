interface Props {
  message: string
}

export default function EmptyState({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-600">
      <div className="text-5xl mb-3">○</div>
      <p className="text-sm">{message}</p>
    </div>
  )
}
