# 発話 → JSON 変換の Few-shot 例

LLM が学習している自然言語パターンを、本プロジェクトの JSON フォーマットに
精度よく射影するための実例集。新たなパターンに気づいたらここに追加する。

## 基本パターン

### 例 1: 製品名 + 工程指定（直接形）

発話: 「フランスパンを成形へ」
出力:
```json
{
  "action": "move",
  "product_hint": "フランスパン",
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": null,
  "to_stage": "成形",
  "direction": "next"
}
```

### 例 2: 同音異義語を含む発話

発話: 「食パンを一時発行にしてください」
出力:
```json
{
  "action": "move",
  "product_hint": "角食パン",
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": null,
  "to_stage": "一次発酵",
  "direction": null
}
```
解説: 「食パン」は角食パン、「一時発行」は同音異義語で正しくは「一次発酵」。

### 例 3: 方向指示（次工程）

発話: 「角食パンを次の工程へ」
出力:
```json
{
  "action": "move",
  "product_hint": "角食パン",
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": null,
  "to_stage": null,
  "direction": "next"
}
```

### 例 4: 担当者と工程の組み合わせ

発話: 「田中さんのパンを焼きに入れて」
出力:
```json
{
  "action": "move",
  "product_hint": null,
  "lot_hint": null,
  "assignee_hint": "田中",
  "from_stage_hint": null,
  "to_stage": "焼成",
  "direction": null
}
```
解説: 「焼きに入れる」= 焼成工程。担当者名から「さん」を除いて hint に。

### 例 5: 現在工程の手がかり付き

発話: 「ホイロにいるフランスパンを成形へ」
出力:
```json
{
  "action": "move",
  "product_hint": "フランスパン",
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": "一次発酵",
  "to_stage": "成形",
  "direction": null
}
```
解説: 「ホイロ」は発酵庫。文脈から「成形へ」なので、現在は一次発酵と推定。

### 例 6: 完了表現（次工程への移動）

発話: 「フランスパンの一次発酵が終わった」
出力:
```json
{
  "action": "move",
  "product_hint": "フランスパン",
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": "一次発酵",
  "to_stage": null,
  "direction": "next"
}
```
解説: 「終わった」は完了→次工程移動の意図。

### 例 7: ロットコードによる特定

発話: 「フランス 01 を包装まで進めて」
出力:
```json
{
  "action": "move",
  "product_hint": "フランスパン",
  "lot_hint": "フランス01",
  "assignee_hint": null,
  "from_stage_hint": null,
  "to_stage": "包装",
  "direction": null
}
```
解説: 「フランス 01」はロットコード末尾の連番形式。スペースは無視して連結。

### 例 8: 操作が判定不能なケース

発話: 「今何時？」
出力:
```json
{
  "action": "unknown",
  "product_hint": null,
  "lot_hint": null,
  "assignee_hint": null,
  "from_stage_hint": null,
  "to_stage": null,
  "direction": null
}
```
解説: バッチ移動と無関係な発話は unknown を返す。
