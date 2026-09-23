export type ColumnCtx = { id: string; name: string };

export type CardCtx = {
  id: string;
  title: string;
  productName: string | null;
  lotCode: string | null;
  columnId: string;
  columnName: string;
  assignee: string | null;
  priority: string;
};

export type VoiceEngineResult =
  | {
      ok: true;
      cardId: string;
      toColumnId: string;
      /** 0〜1。エンジンが確信度を返さない場合は null（ゲーティングなしで即実行） */
      confidence: number | null;
      reason: string;
      debug?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      confidence: number | null;
      /** true: バッチ移動の指示ではない発話（常時録音中の雑音・雑談など）。UIでエラー扱いしないための区別 */
      notACommand?: boolean;
      debug?: Record<string, unknown>;
    };
