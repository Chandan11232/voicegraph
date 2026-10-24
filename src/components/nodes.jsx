import { Fragment, memo, useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Icon, KIND_LABELS } from "../icons.jsx";

function InlineEdit({ value, onDone, className }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save) => onDone(save ? text.trim() : null);
  return (
    <input
      ref={ref}
      className={`inline-edit nodrag ${className || ""}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

// A connection point on every side; each arrow uses the pair of sides that face each other.
const SIDES = [["top", Position.Top], ["right", Position.Right], ["bottom", Position.Bottom], ["left", Position.Left]];

export const ArchNode = memo(function ArchNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const classes = ["arch-node", `kind-${data.kind}`, data.color && `color-${data.color}`, selected && "selected", data.finding && `finding-${data.finding}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onDoubleClick={() => setEditing(true)} title={editing ? undefined : "Drag to move · double-click to rename"}>
      {SIDES.map(([side, position]) => (
        <Fragment key={side}>
          <Handle type="target" id={`t-${side}`} position={position} />
          <Handle type="source" id={`s-${side}`} position={position} />
        </Fragment>
      ))}
      <div className="arch-icon"><Icon name={data.kind} size={20} /></div>
      <div className="arch-text">
        {editing ? (
          <InlineEdit
            value={data.label}
            onDone={(label) => {
              setEditing(false);
              if (label && label !== data.label) data.onRename(id, label);
            }}
          />
        ) : (
          <div className="arch-label">{data.label}</div>
        )}
        <div className="arch-meta">{data.tech || KIND_LABELS[data.kind]}</div>
      </div>
      {data.finding && <span className="finding-dot" aria-label={`${data.finding} severity finding`} />}
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`group-node${selected ? " selected" : ""}`}>
      <div className="group-label" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <InlineEdit
            value={data.label}
            onDone={(label) => {
              setEditing(false);
              if (label && label !== data.label) data.onRename(id, label);
            }}
          />
        ) : (
          data.label
        )}
      </div>
    </div>
  );
});

export const nodeTypes = { arch: ArchNode, group: GroupNode };
