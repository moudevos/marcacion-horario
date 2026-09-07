"use client";

import Swal from "sweetalert2";

export async function confirmDiscardChanges(isDirty: boolean) {
  if (!isDirty) return true;

  const result = await Swal.fire({
    title: "¿Cerrar sin guardar?",
    text: "Tienes cambios que todavía no se han guardado.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Cerrar sin guardar",
    cancelButtonText: "Seguir editando",
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
  });

  return result.isConfirmed;
}
