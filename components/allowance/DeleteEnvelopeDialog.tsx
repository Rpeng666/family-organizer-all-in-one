// components/allowance/DeleteEnvelopeDialog.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { Envelope } from '@/components/EnvelopeItem'; // Assuming type export

interface DeleteEnvelopeDialogProps {
  db: any; // InstantDB instance
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (transferTargetId: string, newDefaultId: string | null) => Promise<void>;
  envelopeToDelete: Envelope | null;
  allEnvelopes: Envelope[]; // All envelopes for the member
}

const DeleteEnvelopeDialog: React.FC<DeleteEnvelopeDialogProps> = ({
  db,
  isOpen,
  onClose,
  onConfirm,
  envelopeToDelete,
  allEnvelopes,
}) => {
  const { toast } = useToast();
  const [transferTargetId, setTransferTargetId] = useState<string | undefined>(undefined);
  const [newDefaultId, setNewDefaultId] = useState<string | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const otherEnvelopes = allEnvelopes.filter(e => e.id !== envelopeToDelete?.id);
  const isDeletingDefault = envelopeToDelete?.isDefault === true;

  // Reset state when modal opens or target envelope changes
  useEffect(() => {
    if (isOpen) {
      setTransferTargetId(undefined);
      setNewDefaultId(undefined);
      setIsDeleting(false);
    }
  }, [isOpen, envelopeToDelete]);

  const handleConfirm = async () => {
    if (!envelopeToDelete || !transferTargetId) {
      toast({ title: "Error", description: "Please select where to transfer funds.", variant: "destructive" });
      return;
    }
    if (isDeletingDefault && !newDefaultId) {
       toast({ title: "Error", description: "Please select a new default envelope.", variant: "destructive" });
       return;
    }
     if (isDeletingDefault && newDefaultId === envelopeToDelete.id) {
         toast({ title: "Error", description: "New default cannot be the envelope being deleted.", variant: "destructive" });
         return;
     }
     if (transferTargetId === envelopeToDelete.id) {
         toast({ title: "Error", description: "Cannot transfer funds to the envelope being deleted.", variant: "destructive" });
         return;
     }


    setIsDeleting(true);
    try {
      // Pass null for newDefaultId if not deleting the default
      await onConfirm(transferTargetId, isDeletingDefault ? newDefaultId : null);
      // onConfirm should handle success toast and closing
    } catch (err: any) {
      // onConfirm should handle error toast
      toast({ title: "Error", description: "Deletion failed for some reason", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !envelopeToDelete || otherEnvelopes.length === 0) {
      // Cannot delete last envelope - this case should ideally be prevented
      // by disabling the delete button in EnvelopeItem, but added safeguard here.
       if (isOpen && envelopeToDelete && otherEnvelopes.length === 0) {
           toast({ title: "Error", description: "Cannot delete the last envelope.", variant: "destructive" });
           onClose(); // Close the dialog immediately
       }
       return null;
  }


  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Envelope: {envelopeToDelete.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. All funds currently in this envelope must be transferred to another envelope.
            {isDeletingDefault && " Since this is your default envelope, you must also select a new default."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-4">
          {/* Transfer Funds To */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="transfer-target" className="text-right">
              Transfer Funds To<span className="text-destructive">*</span>
            </Label>
            <Select
              value={transferTargetId}
              onValueChange={setTransferTargetId}
              required
              disabled={isDeleting}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select envelope..." />
              </SelectTrigger>
              <SelectContent>
                {otherEnvelopes.map(envelope => (
                  <SelectItem key={envelope.id} value={envelope.id}>
                    {envelope.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Select New Default (only if deleting default) */}
          {isDeletingDefault && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-default" className="text-right">
                New Default<span className="text-destructive">*</span>
              </Label>
              <Select
                 value={newDefaultId}
                 onValueChange={setNewDefaultId}
                 required
                 disabled={isDeleting}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select new default..." />
                </SelectTrigger>
                <SelectContent>
                  {otherEnvelopes.map(envelope => (
                    <SelectItem key={envelope.id} value={envelope.id}>
                      {envelope.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting || !transferTargetId || (isDeletingDefault && !newDefaultId)}
            // Use custom styling if needed to show it's destructive
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
              </>
            ) : (
              'Confirm Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteEnvelopeDialog;