import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-success',
  imports: [
    DialogModule,
    ButtonModule
  ],
  templateUrl: './success.html',
  styleUrl: './success.scss',
})
export class Success {
  @Input() title = 'Success!';
  @Input() message = 'Your action was completed successfully.';
  @Output() close = new EventEmitter<void>();
  
  visible = false;

  show(title?: string, message?: string) {
    if (title) this.title = title;
    if (message) this.message = message;
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }
}

