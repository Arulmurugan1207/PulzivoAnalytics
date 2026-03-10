import { Component, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AccordionModule } from 'primeng/accordion';
import { DividerModule } from 'primeng/divider';

interface ContactInfo {
  icon: string;
  title: string;
  value: string;
  link?: string;
}

interface FAQ {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, CardModule, InputTextModule, 
            MessageModule, AccordionModule, DividerModule],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {
  contactForm: FormGroup;
  submitted = signal(false);
  loading = signal(false);

  contactMethods: ContactInfo[] = [
    {
      icon: 'pi-envelope',
      title: 'Email',
      value: 'support@Pulzivo',
      link: 'mailto:support@Pulzivo'
    },
    {
      icon: 'pi-clock',
      title: 'Response Time',
      value: 'Within 24 hours',
    },
    {
      icon: 'pi-globe',
      title: 'Availability',
      value: 'Monday - Friday, 9 AM - 6 PM EST',
    }
  ];

  supportFeatures = [
    {
      icon: 'pi-cog',
      title: 'Technical Support',
      description: 'Implementation questions and troubleshooting'
    },
    {
      icon: 'pi-sync',
      title: 'Custom Integrations',
      description: 'Help with complex tracking setups'
    },
    {
      icon: 'pi-chart-line',
      title: 'Best Practices',
      description: 'Optimization advice for better analytics'
    },
    {
      icon: 'pi-star',
      title: 'Feature Requests',
      description: 'Share your ideas for new dashboard features'
    }
  ];

  constructor(private fb: FormBuilder, private meta: Meta, private titleService: Title) {
    this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      subject: ['', [Validators.required, Validators.minLength(5)]],
      message: ['', [Validators.required, Validators.minLength(20)]]
    });
    this.meta.updateTag({ name: 'description', content: 'Get in touch with the Pulzivo team. We\'re here to help with questions, feedback, and support.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/contact' });
    this.meta.updateTag({ property: 'og:title', content: 'Contact | Pulzivo' });
    this.meta.updateTag({ property: 'og:description', content: 'Get in touch with the Pulzivo team. We\'re here to help with questions, feedback, and support.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/contact' });
    this.meta.updateTag({ property: 'twitter:title', content: 'Contact | Pulzivo' });
    this.meta.updateTag({ property: 'twitter:description', content: 'Get in touch with the Pulzivo team. We\'re here to help with questions, feedback, and support.' });
  }

  onSubmit() {
    if (this.contactForm.valid) {
      this.loading.set(true);
      
      // Simulate form submission
      setTimeout(() => {
        this.loading.set(false);
        this.submitted.set(true);
        this.contactForm.reset();
        
        // Reset success message after 5 seconds
        setTimeout(() => this.submitted.set(false), 5000);
      }, 1500);
    } else {
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key)?.markAsTouched();
      });
    }
  }

  isFieldInvalid(field: string): boolean {
    const control = this.contactForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  faqs: FAQ[] = [
    {
      question: 'How is Pulzivo different from Google Analytics?',
      answer: 'Pulzivo is lightweight (5KB vs 45KB+), privacy-focused, and requires zero configuration. It works out of the box without complex setup or cookie banners.'
    },
    {
      question: 'Do I need to write any code?',
      answer: 'No! Just add one script tag to your HTML. Pulzivo automatically tracks page views, clicks, and user interactions. Custom events are optional.'
    },
    {
      question: 'Is it really free?',
      answer: 'Yes! We offer a free tier with up to 10,000 monthly events. Perfect for personal projects and small websites. Paid plans available for higher volumes.'
    },
    {
      question: 'Is my data secure?',
      answer: 'Absolutely. We use HTTPS encryption, anonymize IP addresses immediately, and are fully GDPR & CCPA compliant. We never sell or share your data.'
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes! You can export your analytics data anytime via the dashboard or API. We believe in data portability and transparency.'
    },
    {
      question: 'Do you offer support?',
      answer: 'Yes! We offer email support for all users. Enterprise customers get priority support with dedicated account managers.'
    }
  ];
}
