import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-why-pulzivo',
  imports: [RouterLink, ButtonModule, DividerModule],
  templateUrl: './why-pulzivo.html',
  styleUrl: './why-pulzivo.scss'
})
export class WhyPulzivo {}
