import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';

// Column accent hues (data-driven — one per pipeline stage).
const STAGES = [
  { key: 'inquiry', label: 'Inquiry', color: '#6366f1' },
  { key: 'discovery_call', label: 'Discovery Call', color: '#3b82f6' },
  { key: 'documents_requested', label: 'Docs Requested', color: '#f59e0b' },
  { key: 'documents_received', label: 'Docs Received', color: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', color: '#06b6d4' },
  { key: 'review', label: 'Review', color: '#7c3aed' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'monthly_retainer', label: 'Monthly Retainer', color: '#0d7377' },
  { key: 'lost', label: 'Lost', color: '#ef4444' },
];

const SOURCE_ICONS = {
  'Website': '🌐', 'WhatsApp': '💬', 'Referral': '🤝',
  'LinkedIn': '💼', 'Walk-in': '🚶', 'Email': '✉️',
  'Phone': '📞', 'Other': '📌', 'zapier': '⚡', 'other': '📌',
};

function LeadCard({ lead, index, onClick }) {
  return (
    <Draggable draggableId={String(lead.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead.id)}
          style={provided.draggableProps.style}
          className={`mb-2 cursor-pointer select-none rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 transition ${snapshot.isDragging ? 'shadow-pop' : 'shadow-soft'}`}
        >
          <div className="mb-1 text-sm font-semibold text-[var(--text)]">{lead.full_name}</div>
          <div className="mb-1.5 text-xs text-[var(--text-muted)]">{lead.phone}</div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-muted)]">
              {SOURCE_ICONS[lead.source] || '📌'} {lead.source}
            </span>
            {lead.assigned_to_name && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent dark:bg-accent/15">
                {lead.assigned_to_name.split(' ')[0]}
              </span>
            )}
          </div>
          {lead.estimated_value && (
            <div className="mt-1 text-[11px] font-semibold text-accent">{lead.estimated_value}</div>
          )}
          {lead.company && (
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">🏢 {lead.company}</div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function KanbanPage() {
  const navigate = useNavigate();
  const [board, setBoard] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchBoard = async () => {
    try {
      const { data } = await api.get('/api/leads/kanban');
      setBoard(data);
    } catch {
      toast.error('Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBoard(); }, []);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    const srcStage = source.droppableId;
    const dstStage = destination.droppableId;
    const leadId = parseInt(draggableId);

    const newBoard = { ...board };
    const srcList = [...(newBoard[srcStage] || [])];
    const dstList = srcStage === dstStage ? srcList : [...(newBoard[dstStage] || [])];
    const [moved] = srcList.splice(source.index, 1);
    moved.stage = dstStage;
    dstList.splice(destination.index, 0, moved);

    setBoard({
      ...newBoard,
      [srcStage]: srcList,
      [dstStage]: dstList,
    });

    try {
      await api.patch(`/api/leads/${leadId}/stage`, { stage: dstStage });
    } catch {
      toast.error('Failed to update stage');
      fetchBoard();
    }
  };

  if (loading) return <div className="p-10 text-[var(--text-muted)]">Loading pipeline…</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Pipeline</h1>
        <p className="page-subtitle">Drag and drop leads across stages</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="h-[calc(100vh-220px)] w-full overflow-x-auto overflow-y-hidden pb-3">
          <div className="flex h-full min-w-max gap-3">
            {STAGES.map(stage => {
              const leads = board[stage.key] || [];
              return (
                <div key={stage.key} className="flex h-full min-w-[240px] max-w-[260px] flex-[0_0_240px] flex-col">
                  <div
                    className="flex justify-between rounded-t-[10px] px-3.5 py-2.5 text-white"
                    style={{ background: stage.color }}
                  >
                    <span className="text-[13px] font-semibold">{stage.label}</span>
                    <span className="rounded-full bg-white/25 px-2 py-px text-xs">{leads.length}</span>
                  </div>

                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{ borderColor: snapshot.isDraggingOver ? stage.color : 'var(--border)' }}
                        className={`flex-1 overflow-y-auto rounded-b-[10px] border border-t-0 p-2 transition ${
                          snapshot.isDraggingOver ? 'bg-accent-soft dark:bg-accent/10' : 'bg-[var(--surface-2)]'
                        }`}
                      >
                        {leads.map((lead, i) => (
                          <LeadCard key={lead.id} lead={lead} index={i} onClick={id => navigate(`/crm/leads/${id}`)} />
                        ))}
                        {provided.placeholder}
                        {leads.length === 0 && !snapshot.isDraggingOver && (
                          <div className="py-5 text-center text-xs text-[var(--text-muted)]/60">Drop here</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
