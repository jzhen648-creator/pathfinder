/**
 * COMPONENT — Toast
 *
 * Generic transient notification message.
 */

type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  return <div>{message}</div>;
}

