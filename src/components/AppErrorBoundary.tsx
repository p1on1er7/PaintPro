import { Component, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error?.message || "Errore sconosciuto",
    };
  }

  componentDidCatch(error: Error) {
    console.error("App boot error:", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">PaintPro non riesce ad avviarsi</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Se vedi questa schermata, c&apos;e un errore di configurazione o di runtime nel deploy.
          </p>
          <pre className="text-xs whitespace-pre-wrap break-words rounded-lg bg-muted p-3">
            {this.state.message}
          </pre>
        </div>
      </div>
    );
  }
}
